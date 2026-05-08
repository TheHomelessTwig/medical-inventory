/**
 * Automatic expired-batch write-off.
 *
 * Runs nightly at 01:00 (after the retention job at 03:00, before reports at 08:00).
 * Finds all inventory_batches where expiry_date < TODAY and quantity > 0,
 * writes them off with adjustment_type = 'expiry', and emails admins a summary.
 */

import cron from 'node-cron';
import { query, withTransaction } from '../db';
import { sendMail } from '../utils/email';
import { emitWebhookEvent } from '../utils/webhooks';

export async function runExpiryWriteoff(): Promise<{ batches_written_off: number; total_qty: number }> {
  const expired = await query(`
    SELECT b.id, b.inventory_item_id, b.batch_number, b.expiry_date,
           b.quantity, i.name AS item_name, i.unit
    FROM inventory_batches b
    JOIN inventory_items i ON b.inventory_item_id = i.id
    WHERE b.expiry_date < CURRENT_DATE
      AND b.quantity > 0
      AND b.is_active = true
    ORDER BY i.name, b.expiry_date
  `);

  if (expired.rows.length === 0) {
    return { batches_written_off: 0, total_qty: 0 };
  }

  let totalQty = 0;

  await withTransaction(async (client) => {
    for (const batch of expired.rows) {
      const qty = parseFloat(batch.quantity);
      totalQty += qty;

      // Read current stock level
      const itemRow = await client.query(
        `SELECT quantity_on_hand FROM inventory_items WHERE id = $1 FOR UPDATE`,
        [batch.inventory_item_id]
      );
      const currentQty = parseFloat(itemRow.rows[0]?.quantity_on_hand ?? '0');
      const newQty = Math.max(0, currentQty - qty);

      // Write off the batch
      await client.query(
        `UPDATE inventory_batches SET quantity = 0 WHERE id = $1`,
        [batch.id]
      );
      await client.query(
        `UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2`,
        [newQty, batch.inventory_item_id]
      );
      await client.query(`
        INSERT INTO stock_adjustments
          (inventory_item_id, batch_id, adjusted_by, adjustment_type,
           quantity_before, quantity_change, quantity_after, reason, reference_type)
        VALUES ($1,$2,
          (SELECT id FROM users WHERE role='admin' AND is_active=true LIMIT 1),
          'expiry', $3, $4, $5,
          $6, 'auto_expiry_writeoff')
      `, [
        batch.inventory_item_id, batch.id,
        currentQty, -qty, newQty,
        `Automatic write-off: batch ${batch.batch_number} expired ${batch.expiry_date}`,
      ]);
    }
  });

  // Email admins
  const admins = await query(`SELECT email FROM users WHERE role IN ('admin','practice_manager') AND is_active=true`);
  const adminEmails = admins.rows.map((r: { email: string }) => r.email);

  if (adminEmails.length > 0) {
    const rows = expired.rows.map((b: { item_name: string; batch_number: string; expiry_date: string; quantity: number; unit: string }) =>
      `<tr>
        <td style="padding:4px 8px">${b.item_name}</td>
        <td style="padding:4px 8px">${b.batch_number}</td>
        <td style="padding:4px 8px">${b.expiry_date}</td>
        <td style="padding:4px 8px">${b.quantity} ${b.unit}</td>
      </tr>`
    ).join('');

    await sendMail(
      adminEmails,
      `S.H.I.T. — ${expired.rows.length} expired batch${expired.rows.length > 1 ? 'es' : ''} written off`,
      `<h2>Automatic Expiry Write-off</h2>
       <p>The following batches expired and were written off automatically:</p>
       <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
         <tr style="background:#f1f5f9">
           <th style="padding:4px 8px;text-align:left">Item</th>
           <th style="padding:4px 8px;text-align:left">Batch</th>
           <th style="padding:4px 8px;text-align:left">Expiry</th>
           <th style="padding:4px 8px;text-align:left">Qty</th>
         </tr>
         ${rows}
       </table>
       <p style="margin-top:16px">These adjustments appear in the audit log and wastage report.</p>`
    );
  }

  // Emit webhook
  await emitWebhookEvent('stock.expired', {
    batches_written_off: expired.rows.length,
    total_qty: totalQty,
    items: expired.rows.map((b: { item_name: string; batch_number: string; expiry_date: string; quantity: number }) => ({
      item_name: b.item_name,
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      quantity: b.quantity,
    })),
  });

  console.log(`[expiry-writeoff] Wrote off ${expired.rows.length} batches (${totalQty} total units)`);
  return { batches_written_off: expired.rows.length, total_qty: totalQty };
}

export function startExpiryWriteoffJob(): void {
  const timezone = process.env.REPORT_TIMEZONE || 'UTC';
  cron.schedule('0 1 * * *', () => {
    console.log('[expiry-writeoff] Running nightly expiry write-off…');
    runExpiryWriteoff().catch(err => console.error('[expiry-writeoff] Failed:', err));
  }, { timezone });
  console.log(`[expiry-writeoff] Nightly write-off scheduled (${timezone}, 01:00)`);
}
