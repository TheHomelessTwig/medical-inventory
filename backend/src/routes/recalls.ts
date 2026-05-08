/**
 * Supplier recall management.
 *
 * GET    /api/recalls                    — list
 * GET    /api/recalls/:id                — detail with affected batches
 * POST   /api/recalls                    — create recall (searches affected stock)
 * PUT    /api/recalls/:id                — update recall
 * POST   /api/recalls/:id/quarantine     — quarantine all affected batches
 * POST   /api/recalls/:id/close          — close recall
 * GET    /api/recalls/:id/export         — CSV of affected dispensing events
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { stringify } from 'csv-stringify/sync';
import { query, withTransaction } from '../db';
import { authenticate, requireAdminOrManager } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { sendMail } from '../utils/email';
import { emitWebhookEvent } from '../utils/webhooks';

const router = Router();
router.use(authenticate);

const recallSchema = z.object({
  title:           z.string().min(1).max(255),
  description:     z.string().optional().nullable(),
  supplier_id:     z.string().uuid().optional().nullable(),
  supplier_name:   z.string().optional().nullable(),
  batch_numbers:   z.array(z.string()).min(1),
  item_ids:        z.array(z.string().uuid()).optional().default([]),
  severity:        z.enum(['low','moderate','high','critical']).default('moderate'),
  regulatory_ref:  z.string().optional().nullable(),
  action_required: z.string().optional().nullable(),
});

// GET /api/recalls
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (status) { conditions.push(`status = $${p++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(`
      SELECT r.*, u.name AS created_by_name
      FROM recalls r JOIN users u ON r.created_by = u.id
      ${where} ORDER BY r.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/recalls/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT r.*, u.name AS created_by_name FROM recalls r JOIN users u ON r.created_by=u.id WHERE r.id=$1`,
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Recall not found' }); return; }
    const recall = result.rows[0];

    // Find affected batches in inventory
    const batches = await query(`
      SELECT b.id, b.batch_number, b.expiry_date, b.quantity, b.is_active,
             i.name AS item_name, i.unit
      FROM inventory_batches b
      JOIN inventory_items i ON b.inventory_item_id = i.id
      WHERE b.batch_number = ANY($1::text[])
         OR i.id = ANY($2::uuid[])
      ORDER BY i.name, b.batch_number
    `, [recall.batch_numbers, recall.item_ids.length ? recall.item_ids : ['00000000-0000-0000-0000-000000000000']]);

    // Find patients who received affected batches
    const dispensed = await query(`
      SELECT sr.patient_name, sr.patient_ref, sf.completed_at,
             sfi.quantity_used, sfi.batch_number,
             i.name AS item_name, d.name AS doctor_name, n.name AS nurse_name
      FROM stock_fulfillment_items sfi
      JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
      JOIN stock_requests sr     ON sf.request_id = sr.id
      JOIN inventory_items i     ON sfi.inventory_item_id = i.id
      JOIN users d               ON sr.doctor_id = d.id
      JOIN users n               ON sf.nurse_id  = n.id
      WHERE sfi.batch_number = ANY($1::text[])
      ORDER BY sf.completed_at DESC
    `, [recall.batch_numbers]);

    res.json({ ...recall, affected_batches: batches.rows, dispensed_to: dispensed.rows });
  } catch (err) { next(err); }
});

// POST /api/recalls
router.post('/', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = recallSchema.parse(req.body);

    const seq = await query(`SELECT nextval('recall_number_seq') AS seq`);
    const recallNum = `RCL-${String(seq.rows[0].seq).padStart(6, '0')}`;

    const result = await query(`
      INSERT INTO recalls
        (recall_number, title, description, supplier_id, supplier_name,
         batch_numbers, item_ids, severity, regulatory_ref, action_required, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [recallNum, body.title, body.description, body.supplier_id, body.supplier_name,
        body.batch_numbers, body.item_ids, body.severity, body.regulatory_ref,
        body.action_required, req.user!.id]);

    // Count how many batches are affected
    const affectedCount = await query(
      `SELECT COUNT(*) FROM inventory_batches WHERE batch_number = ANY($1::text[]) AND quantity > 0`,
      [body.batch_numbers]
    );

    // Email all admins + practice managers
    const admins = await query(`SELECT email FROM users WHERE role IN ('admin','practice_manager') AND is_active=true`);
    const emails = admins.rows.map((r: { email: string }) => r.email);
    if (emails.length > 0) {
      const sevColour = { low: '#64748b', moderate: '#f59e0b', high: '#ef4444', critical: '#7c3aed' }[body.severity] ?? '#64748b';
      await sendMail(emails, `⚠️ S.H.I.T. — New Recall ${recallNum}: ${body.title}`, `
        <h2 style="color:${sevColour}">Recall Notice — ${body.severity.toUpperCase()}</h2>
        <p><strong>${body.title}</strong></p>
        ${body.description ? `<p>${body.description}</p>` : ''}
        <ul>
          <li>Recall #: ${recallNum}</li>
          <li>Affected batch numbers: ${body.batch_numbers.join(', ')}</li>
          <li>Batches in stock: ${affectedCount.rows[0].count}</li>
          ${body.regulatory_ref ? `<li>Regulatory ref: ${body.regulatory_ref}</li>` : ''}
        </ul>
        ${body.action_required ? `<p><strong>Action required:</strong> ${body.action_required}</p>` : ''}
        <p>Log in to view the full list of affected batches and patients.</p>
      `);
    }

    await emitWebhookEvent('recall.created', {
      recall_id: result.rows[0].id,
      recall_number: recallNum,
      severity: body.severity,
      batch_numbers: body.batch_numbers,
    });

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'RECALL_CREATED', entityType: 'recall', entityId: result.rows[0].id, entityName: recallNum, newValues: body, ipAddress, userAgent });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

// POST /api/recalls/:id/quarantine — zero out / flag all affected batches
router.post('/:id/quarantine', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const recallResult = await query(`SELECT * FROM recalls WHERE id = $1`, [req.params.id]);
    if (recallResult.rows.length === 0) { res.status(404).json({ error: 'Recall not found' }); return; }
    const recall = recallResult.rows[0];

    let quarantined = 0;
    await withTransaction(async (client) => {
      const batches = await client.query(
        `SELECT b.id, b.inventory_item_id, b.quantity FROM inventory_batches b
         WHERE b.batch_number = ANY($1::text[]) AND b.quantity > 0`,
        [recall.batch_numbers]
      );

      for (const batch of batches.rows) {
        const qty = parseFloat(batch.quantity);
        const itemRow = await client.query(
          `SELECT quantity_on_hand FROM inventory_items WHERE id = $1 FOR UPDATE`,
          [batch.inventory_item_id]
        );
        const currentQty = parseFloat(itemRow.rows[0]?.quantity_on_hand ?? '0');
        const newQty = Math.max(0, currentQty - qty);

        await client.query(`UPDATE inventory_batches SET quantity = 0 WHERE id = $1`, [batch.id]);
        await client.query(`UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2`, [newQty, batch.inventory_item_id]);
        await client.query(`
          INSERT INTO stock_adjustments
            (inventory_item_id, batch_id, adjusted_by, adjustment_type,
             quantity_before, quantity_change, quantity_after, reason, reference_id, reference_type)
          VALUES ($1,$2,$3,'decrease',$4,$5,$6,$7,$8,'recall')
        `, [batch.inventory_item_id, batch.id, req.user!.id,
            currentQty, -qty, newQty,
            `Quarantined — Recall ${recall.recall_number}: ${recall.title}`, req.params.id]);
        quarantined++;
      }

      await client.query(`UPDATE recalls SET status = 'quarantined' WHERE id = $1`, [req.params.id]);
    });

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'RECALL_QUARANTINED', entityType: 'recall', entityId: req.params.id, entityName: recall.recall_number, newValues: { batches_quarantined: quarantined }, ipAddress, userAgent });

    res.json({ message: `${quarantined} batch(es) quarantined`, batches_quarantined: quarantined });
  } catch (err) { next(err); }
});

// POST /api/recalls/:id/close
router.post('/:id/close', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `UPDATE recalls SET status='closed', closed_by=$1, closed_at=NOW() WHERE id=$2 AND status!='closed' RETURNING recall_number`,
      [req.user!.id, req.params.id]
    );
    if (result.rows.length === 0) { res.status(400).json({ error: 'Recall not found or already closed' }); return; }
    res.json({ message: 'Recall closed' });
  } catch (err) { next(err); }
});

// GET /api/recalls/:id/export — CSV of dispensed-to patients
router.get('/:id/export', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const recall = await query(`SELECT * FROM recalls WHERE id = $1`, [req.params.id]);
    if (recall.rows.length === 0) { res.status(404).json({ error: 'Recall not found' }); return; }
    const r = recall.rows[0];

    const dispensed = await query(`
      SELECT sr.patient_name, sr.patient_ref, sf.completed_at,
             sfi.quantity_used, sfi.batch_number, i.name AS item_name,
             d.name AS doctor_name, n.name AS nurse_name
      FROM stock_fulfillment_items sfi
      JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
      JOIN stock_requests sr     ON sf.request_id = sr.id
      JOIN inventory_items i     ON sfi.inventory_item_id = i.id
      JOIN users d               ON sr.doctor_id = d.id
      JOIN users n               ON sf.nurse_id  = n.id
      WHERE sfi.batch_number = ANY($1::text[])
      ORDER BY sf.completed_at DESC
    `, [r.batch_numbers]);

    const csv = stringify(dispensed.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="recall_${r.recall_number}_patients.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
