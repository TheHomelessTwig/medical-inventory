/**
 * Auto-reorder check — called after any stock decrement.
 * If auto_reorder=true and stock just crossed the reorder threshold,
 * creates a draft PO (unless one already exists for this item+supplier).
 */

import { PoolClient } from 'pg';
import { emitWebhookEvent } from './webhooks';

export async function checkAutoReorder(
  client: PoolClient,
  inventoryItemId: string
): Promise<void> {
  try {
    const itemRow = await client.query(`
      SELECT i.id, i.name, i.quantity_on_hand, i.reorder_threshold,
             i.reorder_quantity, i.auto_reorder, i.supplier_id,
             s.name AS supplier_name, s.email AS supplier_email
      FROM inventory_items i
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = $1
    `, [inventoryItemId]);

    const item = itemRow.rows[0];
    if (!item) return;
    if (!item.auto_reorder) return;
    if (!item.supplier_id) return;
    if (item.reorder_threshold <= 0) return;
    if (parseFloat(item.quantity_on_hand) > parseFloat(item.reorder_threshold)) return;

    // Check for an existing open PO for this item+supplier
    const existingPO = await client.query(`
      SELECT po.id FROM purchase_orders po
      JOIN purchase_order_items poi ON poi.po_id = po.id
      WHERE po.supplier_id = $1
        AND poi.inventory_item_id = $2
        AND po.status IN ('draft', 'sent', 'partial')
      LIMIT 1
    `, [item.supplier_id, inventoryItemId]);

    if (existingPO.rows.length > 0) return;  // Already have an open PO

    // Create draft PO
    const seq = await client.query(`SELECT nextval('po_number_seq') AS seq`);
    const poNum = `PO-${String(seq.rows[0].seq).padStart(6, '0')}`;
    const orderQty = item.reorder_quantity
      ? parseFloat(item.reorder_quantity)
      : parseFloat(item.reorder_threshold) * 2;
    const unitCost = null;  // Don't auto-fill price — admin reviews

    const adminRow = await client.query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active = true LIMIT 1`
    );
    const adminId = adminRow.rows[0]?.id;
    if (!adminId) return;

    const poResult = await client.query(`
      INSERT INTO purchase_orders
        (po_number, supplier_id, supplier_name, notes, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      poNum, item.supplier_id, item.supplier_name,
      `Auto-created: stock for "${item.name}" reached reorder threshold`, adminId,
    ]);

    await client.query(`
      INSERT INTO purchase_order_items
        (po_id, inventory_item_id, item_name, quantity_ordered, unit_cost)
      VALUES ($1, $2, $3, $4, $5)
    `, [poResult.rows[0].id, inventoryItemId, item.name, orderQty, unitCost]);

    console.log(`[auto-reorder] Draft PO ${poNum} created for "${item.name}" (${orderQty} units)`);

    // Fire webhook (outside transaction — best effort)
    setImmediate(() => {
      emitWebhookEvent('stock.low', {
        item_id: inventoryItemId,
        item_name: item.name,
        quantity_on_hand: item.quantity_on_hand,
        reorder_threshold: item.reorder_threshold,
        po_number: poNum,
        order_qty: orderQty,
      }).catch(() => {});
    });
  } catch (err) {
    // Auto-reorder failures must never crash the calling transaction
    console.error('[auto-reorder] checkAutoReorder failed:', err);
  }
}
