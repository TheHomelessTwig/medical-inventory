/**
 * Purchase Order workflow.
 *
 * GET    /api/purchase-orders          — list
 * GET    /api/purchase-orders/:id      — detail (includes line items)
 * POST   /api/purchase-orders          — create draft
 * PUT    /api/purchase-orders/:id      — update draft
 * POST   /api/purchase-orders/:id/send — mark as sent (optionally email supplier)
 * POST   /api/purchase-orders/:id/receive — mark received, update stock + create invoice
 * DELETE /api/purchase-orders/:id      — delete draft / cancel
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { stringify } from 'csv-stringify/sync';
import { query, withTransaction } from '../db';
import { authenticate, requireAdminOrManager } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { createError } from '../middleware/errorHandler';
import { sendMail } from '../utils/email';

const router = Router();
router.use(authenticate);

const poItemSchema = z.object({
  inventory_item_id: z.string().uuid().optional().nullable(),
  item_name:         z.string().min(1),
  quantity_ordered:  z.number().positive(),
  unit_cost:         z.number().min(0).optional().nullable(),
  gst_applicable:    z.boolean().default(true),
  notes:             z.string().optional().nullable(),
});

const poSchema = z.object({
  supplier_id:   z.string().uuid().optional().nullable(),
  supplier_name: z.string().min(1),
  notes:         z.string().optional().nullable(),
  expected_date: z.string().optional().nullable(),
  items:         z.array(poItemSchema).min(1),
});

const receiveItemSchema = z.object({
  po_item_id:        z.string().uuid(),
  quantity_received: z.number().min(0),
  batch_number:      z.string().optional().nullable(),
  expiry_date:       z.string().optional().nullable(),
});

// GET /api/purchase-orders
router.get('/', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, supplier_id, page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (status)      { conditions.push(`po.status = $${p++}`);      params.push(status); }
    if (supplier_id) { conditions.push(`po.supplier_id = $${p++}`); params.push(supplier_id); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await query(`SELECT COUNT(*) FROM purchase_orders po ${where}`, params);
    const result = await query(`
      SELECT po.*, u.name AS created_by_name, r.name AS received_by_name,
             (SELECT COUNT(*) FROM purchase_order_items pi WHERE pi.po_id = po.id) AS item_count
      FROM purchase_orders po
      JOIN users u ON po.created_by = u.id
      LEFT JOIN users r ON po.received_by = r.id
      ${where}
      ORDER BY po.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limitNum, offset]);

    res.json({ orders: result.rows, total: parseInt(countResult.rows[0].count), page: pageNum });
  } catch (err) { next(err); }
});

// GET /api/purchase-orders/:id
router.get('/:id', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT po.*, u.name AS created_by_name, r.name AS received_by_name
      FROM purchase_orders po
      JOIN users u ON po.created_by = u.id
      LEFT JOIN users r ON po.received_by = r.id
      WHERE po.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) { res.status(404).json({ error: 'Purchase order not found' }); return; }

    const items = await query(`
      SELECT pi.*, i.name AS linked_item_name, i.unit
      FROM purchase_order_items pi
      LEFT JOIN inventory_items i ON pi.inventory_item_id = i.id
      WHERE pi.po_id = $1
      ORDER BY pi.item_name
    `, [req.params.id]);

    const attachments = await query(
      `SELECT id, filename, mime_type, size_bytes, created_at FROM attachments
       WHERE entity_type = 'purchase_order' AND entity_id = $1 ORDER BY created_at`,
      [req.params.id]
    );

    res.json({ ...result.rows[0], items: items.rows, attachments: attachments.rows });
  } catch (err) { next(err); }
});

// POST /api/purchase-orders
router.post('/', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = poSchema.parse(req.body);

    const poId = await withTransaction(async (client) => {
      const seq    = await client.query(`SELECT nextval('po_number_seq') AS seq`);
      const poNum  = `PO-${String(seq.rows[0].seq).padStart(6, '0')}`;

      let subtotal   = 0;
      let gstAmount  = 0;

      for (const item of body.items) {
        const cost = item.unit_cost ?? 0;
        const line = cost * item.quantity_ordered;
        const gst  = item.gst_applicable ? line * 0.1 : 0;
        subtotal  += line;
        gstAmount += gst;
      }

      const result = await client.query(`
        INSERT INTO purchase_orders
          (po_number, supplier_id, supplier_name, notes, expected_date,
           subtotal, gst_amount, total_value, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id
      `, [poNum, body.supplier_id, body.supplier_name, body.notes,
          body.expected_date, subtotal, gstAmount, subtotal + gstAmount, req.user!.id]);

      const poId = result.rows[0].id;

      for (const item of body.items) {
        await client.query(`
          INSERT INTO purchase_order_items
            (po_id, inventory_item_id, item_name, quantity_ordered, unit_cost, gst_applicable, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [poId, item.inventory_item_id, item.item_name, item.quantity_ordered,
            item.unit_cost, item.gst_applicable, item.notes]);
      }

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'PURCHASE_ORDER_CREATED',
        entityType: 'purchase_order',
        entityId: poId,
        entityName: poNum,
        newValues: { supplier: body.supplier_name, items: body.items.length },
        ipAddress,
        userAgent,
      }, client);

      return poId;
    });

    const po = await query('SELECT * FROM purchase_orders WHERE id = $1', [poId]);
    res.status(201).json(po.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

// PUT /api/purchase-orders/:id
router.put('/:id', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const po = await query(`SELECT * FROM purchase_orders WHERE id = $1`, [req.params.id]);
    if (po.rows.length === 0) { res.status(404).json({ error: 'Purchase order not found' }); return; }
    if (po.rows[0].status !== 'draft') { res.status(400).json({ error: 'Only draft orders can be edited' }); return; }

    const body = poSchema.parse(req.body);

    await withTransaction(async (client) => {
      let subtotal = 0, gstAmount = 0;
      for (const item of body.items) {
        const cost = item.unit_cost ?? 0;
        const line = cost * item.quantity_ordered;
        subtotal  += line;
        gstAmount += item.gst_applicable ? line * 0.1 : 0;
      }

      await client.query(`
        UPDATE purchase_orders SET
          supplier_id = $1, supplier_name = $2, notes = $3, expected_date = $4,
          subtotal = $5, gst_amount = $6, total_value = $7
        WHERE id = $8
      `, [body.supplier_id, body.supplier_name, body.notes, body.expected_date,
          subtotal, gstAmount, subtotal + gstAmount, req.params.id]);

      await client.query('DELETE FROM purchase_order_items WHERE po_id = $1', [req.params.id]);
      for (const item of body.items) {
        await client.query(`
          INSERT INTO purchase_order_items
            (po_id, inventory_item_id, item_name, quantity_ordered, unit_cost, gst_applicable, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [req.params.id, item.inventory_item_id, item.item_name, item.quantity_ordered,
            item.unit_cost, item.gst_applicable, item.notes]);
      }
    });

    const updated = await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

// POST /api/purchase-orders/:id/send — mark as sent, optionally email the supplier
router.post('/:id/send', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `UPDATE purchase_orders SET status = 'sent', sent_at = NOW()
       WHERE id = $1 AND status = 'draft' RETURNING *, (SELECT email FROM suppliers WHERE id = purchase_orders.supplier_id) AS supplier_email`,
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(400).json({ error: 'Order not found or not in draft state' }); return; }

    const po = result.rows[0];

    // Email supplier if they have an email on file
    if (po.supplier_email) {
      const items = await query('SELECT * FROM purchase_order_items WHERE po_id = $1', [req.params.id]);
      const itemRows = items.rows.map((i: { item_name: string; quantity_ordered: number; unit_cost: number }) =>
        `<tr><td>${i.item_name}</td><td>${i.quantity_ordered}</td><td>${i.unit_cost ? `$${Number(i.unit_cost).toFixed(2)}` : '—'}</td></tr>`
      ).join('');
      await sendMail(po.supplier_email, `Purchase Order ${po.po_number}`, `
        <h2>Purchase Order — ${po.po_number}</h2>
        <p>Please supply the following items:</p>
        <table border="1" cellpadding="4">
          <tr><th>Item</th><th>Qty</th><th>Unit Cost</th></tr>
          ${itemRows}
        </table>
        <p>Expected date: ${po.expected_date || 'ASAP'}</p>
        ${po.notes ? `<p>Notes: ${po.notes}</p>` : ''}
      `);
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'PURCHASE_ORDER_SENT', entityType: 'purchase_order', entityId: req.params.id, entityName: po.po_number, ipAddress, userAgent });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/purchase-orders/:id/receive — mark received, update stock
router.post('/:id/receive', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const receiveSchema = z.object({
      items: z.array(receiveItemSchema).min(1),
      notes: z.string().optional().nullable(),
    });
    const body = receiveSchema.parse(req.body);

    await withTransaction(async (client) => {
      const po = await client.query(
        `SELECT * FROM purchase_orders WHERE id = $1 AND status IN ('sent','partial','draft') FOR UPDATE`,
        [req.params.id]
      );
      if (po.rows.length === 0) throw createError('Order not found or already fully received', 404);

      let allReceived = true;

      for (const recv of body.items) {
        if (recv.quantity_received === 0) continue;

        const poItem = await client.query(
          `SELECT * FROM purchase_order_items WHERE id = $1 AND po_id = $2`,
          [recv.po_item_id, req.params.id]
        );
        if (poItem.rows.length === 0) continue;
        const pi = poItem.rows[0];

        await client.query(
          `UPDATE purchase_order_items SET quantity_received = quantity_received + $1 WHERE id = $2`,
          [recv.quantity_received, recv.po_item_id]
        );

        if (pi.inventory_item_id) {
          // Update or create batch
          if (recv.batch_number) {
            await client.query(`
              INSERT INTO inventory_batches
                (inventory_item_id, batch_number, expiry_date, quantity, supplier_cost)
              VALUES ($1,$2,$3,$4,$5)
              ON CONFLICT (inventory_item_id, batch_number)
              DO UPDATE SET quantity = inventory_batches.quantity + $4
            `, [pi.inventory_item_id, recv.batch_number, recv.expiry_date, recv.quantity_received, pi.unit_cost]);
          }
          await client.query(
            `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE id = $2`,
            [recv.quantity_received, pi.inventory_item_id]
          );
          await client.query(`
            INSERT INTO stock_adjustments
              (inventory_item_id, adjusted_by, adjustment_type, quantity_change, reason, reference_id, reference_type)
            VALUES ($1,$2,'increase',$3,$4,$5,'purchase_order')
          `, [pi.inventory_item_id, req.user!.id, recv.quantity_received,
              `Received on PO ${po.rows[0].po_number}`, req.params.id]);
        }

        const updatedItem = await client.query(
          `SELECT quantity_ordered, quantity_received FROM purchase_order_items WHERE id = $1`,
          [recv.po_item_id]
        );
        if (parseFloat(updatedItem.rows[0].quantity_received) < parseFloat(updatedItem.rows[0].quantity_ordered)) {
          allReceived = false;
        }
      }

      const newStatus = allReceived ? 'received' : 'partial';
      await client.query(
        `UPDATE purchase_orders SET status = $1, received_at = NOW(), received_by = $2,
         notes = COALESCE($3, notes) WHERE id = $4`,
        [newStatus, req.user!.id, body.notes, req.params.id]
      );

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user, action: 'PURCHASE_ORDER_RECEIVED',
        entityType: 'purchase_order', entityId: req.params.id,
        entityName: po.rows[0].po_number,
        newValues: { status: newStatus, items_received: body.items.length },
        ipAddress, userAgent,
      }, client);
    });

    const updated = await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

// DELETE /api/purchase-orders/:id — cancel / delete draft
router.delete('/:id', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `UPDATE purchase_orders SET status = 'cancelled'
       WHERE id = $1 AND status IN ('draft','sent') RETURNING po_number`,
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(400).json({ error: 'Order not found or cannot be cancelled' }); return; }
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'PURCHASE_ORDER_CANCELLED', entityType: 'purchase_order', entityId: req.params.id, entityName: result.rows[0].po_number, ipAddress, userAgent });
    res.json({ message: 'Purchase order cancelled' });
  } catch (err) { next(err); }
});

// GET /api/purchase-orders/:id/export — CSV export
router.get('/:id/export', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const po = await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
    if (po.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    const items = await query('SELECT * FROM purchase_order_items WHERE po_id = $1', [req.params.id]);
    const csv = stringify(items.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${po.rows[0].po_number}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
