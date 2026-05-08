/**
 * Stock transfers between sites.
 *
 * GET    /api/transfers              — list
 * GET    /api/transfers/:id          — detail
 * POST   /api/transfers              — create draft
 * PUT    /api/transfers/:id          — update draft
 * POST   /api/transfers/:id/dispatch — mark in_transit (deduct from source)
 * POST   /api/transfers/:id/receive  — mark received (add to destination)
 * DELETE /api/transfers/:id          — cancel draft
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { authenticate, requireAdminOrNurse } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { createError } from '../middleware/errorHandler';
import { emitWebhookEvent } from '../utils/webhooks';

const router = Router();
router.use(authenticate, requireAdminOrNurse);

const itemSchema = z.object({
  inventory_item_id: z.string().uuid(),
  batch_id:          z.string().uuid().optional().nullable(),
  batch_number:      z.string().optional().nullable(),
  quantity_sent:     z.number().positive(),
  notes:             z.string().optional().nullable(),
});

const createSchema = z.object({
  from_site_id: z.string().uuid(),
  to_site_id:   z.string().uuid(),
  notes:        z.string().optional().nullable(),
  items:        z.array(itemSchema).min(1),
});

// GET /api/transfers
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (status) { conditions.push(`t.status = $${p++}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await query(`SELECT COUNT(*) FROM stock_transfers t ${where}`, params);
    const result = await query(`
      SELECT t.*, fs.name AS from_site_name, ts.name AS to_site_name,
             cb.name AS created_by_name,
             (SELECT COUNT(*) FROM stock_transfer_items ti WHERE ti.transfer_id = t.id) AS item_count
      FROM stock_transfers t
      JOIN sites fs ON t.from_site_id = fs.id
      JOIN sites ts ON t.to_site_id   = ts.id
      JOIN users cb ON t.created_by   = cb.id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT $${p} OFFSET $${p+1}
    `, [...params, limitNum, offset]);

    res.json({ transfers: result.rows, total: parseInt(total.rows[0].count), page: pageNum });
  } catch (err) { next(err); }
});

// GET /api/transfers/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT t.*, fs.name AS from_site_name, ts.name AS to_site_name, cb.name AS created_by_name
      FROM stock_transfers t
      JOIN sites fs ON t.from_site_id = fs.id
      JOIN sites ts ON t.to_site_id   = ts.id
      JOIN users cb ON t.created_by   = cb.id
      WHERE t.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Transfer not found' }); return; }

    const items = await query(`
      SELECT ti.*, i.name AS item_name, i.unit
      FROM stock_transfer_items ti
      JOIN inventory_items i ON ti.inventory_item_id = i.id
      WHERE ti.transfer_id = $1 ORDER BY i.name
    `, [req.params.id]);

    res.json({ ...result.rows[0], items: items.rows });
  } catch (err) { next(err); }
});

// POST /api/transfers
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = createSchema.parse(req.body);
    if (body.from_site_id === body.to_site_id) {
      res.status(400).json({ error: 'Source and destination sites must be different' }); return;
    }

    const transferId = await withTransaction(async (client) => {
      const seq    = await client.query(`SELECT nextval('transfer_number_seq') AS seq`);
      const tNum   = `TRF-${String(seq.rows[0].seq).padStart(6, '0')}`;

      const result = await client.query(`
        INSERT INTO stock_transfers (transfer_number, from_site_id, to_site_id, notes, created_by)
        VALUES ($1,$2,$3,$4,$5) RETURNING id
      `, [tNum, body.from_site_id, body.to_site_id, body.notes, req.user!.id]);

      const transferId = result.rows[0].id;
      for (const item of body.items) {
        await client.query(`
          INSERT INTO stock_transfer_items
            (transfer_id, inventory_item_id, batch_id, batch_number, quantity_sent, notes)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [transferId, item.inventory_item_id, item.batch_id, item.batch_number,
            item.quantity_sent, item.notes]);
      }

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({ user: req.user, action: 'TRANSFER_CREATED', entityType: 'transfer', entityId: transferId, entityName: tNum, newValues: { from: body.from_site_id, to: body.to_site_id, items: body.items.length }, ipAddress, userAgent }, client);
      return transferId;
    });

    const t = await query('SELECT * FROM stock_transfers WHERE id = $1', [transferId]);
    res.status(201).json(t.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

// POST /api/transfers/:id/dispatch — deduct stock from source site
router.post('/:id/dispatch', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await withTransaction(async (client) => {
      const t = await client.query(
        `SELECT * FROM stock_transfers WHERE id = $1 AND status = 'draft' FOR UPDATE`,
        [req.params.id]
      );
      if (t.rows.length === 0) throw createError('Transfer not found or not in draft state', 404);

      const items = await client.query(
        `SELECT ti.*, i.quantity_on_hand FROM stock_transfer_items ti
         JOIN inventory_items i ON ti.inventory_item_id = i.id
         WHERE ti.transfer_id = $1`, [req.params.id]
      );

      for (const item of items.rows) {
        const newQty = Math.max(0, parseFloat(item.quantity_on_hand) - parseFloat(item.quantity_sent));
        await client.query(
          `UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2`,
          [newQty, item.inventory_item_id]
        );
        await client.query(`
          INSERT INTO stock_adjustments
            (inventory_item_id, batch_id, adjusted_by, adjustment_type,
             quantity_before, quantity_change, quantity_after, reason, reference_id, reference_type)
          VALUES ($1,$2,$3,'decrease',$4,$5,$6,$7,$8,'transfer')
        `, [item.inventory_item_id, item.batch_id, req.user!.id,
            item.quantity_on_hand, -item.quantity_sent, newQty,
            `Dispatched in transfer ${t.rows[0].transfer_number}`, req.params.id]);
      }

      await client.query(
        `UPDATE stock_transfers SET status='in_transit', dispatched_by=$1, dispatched_at=NOW() WHERE id=$2`,
        [req.user!.id, req.params.id]
      );
    });

    const updated = await query('SELECT * FROM stock_transfers WHERE id=$1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/transfers/:id/receive — add stock at destination
router.post('/:id/receive', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await withTransaction(async (client) => {
      const t = await client.query(
        `SELECT * FROM stock_transfers WHERE id = $1 AND status = 'in_transit' FOR UPDATE`,
        [req.params.id]
      );
      if (t.rows.length === 0) throw createError('Transfer not found or not in transit', 404);

      const items = await client.query(
        `SELECT ti.*, i.quantity_on_hand FROM stock_transfer_items ti
         JOIN inventory_items i ON ti.inventory_item_id = i.id
         WHERE ti.transfer_id = $1`, [req.params.id]
      );

      for (const item of items.rows) {
        const addQty = parseFloat(item.quantity_sent);
        const newQty = parseFloat(item.quantity_on_hand) + addQty;
        await client.query(
          `UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2`,
          [newQty, item.inventory_item_id]
        );
        await client.query(`
          INSERT INTO stock_adjustments
            (inventory_item_id, batch_id, adjusted_by, adjustment_type,
             quantity_before, quantity_change, quantity_after, reason, reference_id, reference_type)
          VALUES ($1,$2,$3,'increase',$4,$5,$6,$7,$8,'transfer')
        `, [item.inventory_item_id, item.batch_id, req.user!.id,
            item.quantity_on_hand, addQty, newQty,
            `Received in transfer ${t.rows[0].transfer_number}`, req.params.id]);
      }

      await client.query(
        `UPDATE stock_transfers SET status='received', received_by=$1, received_at=NOW() WHERE id=$2`,
        [req.user!.id, req.params.id]
      );
    });

    await emitWebhookEvent('transfer.received', { transfer_id: req.params.id });
    const updated = await query('SELECT * FROM stock_transfers WHERE id=$1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/transfers/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `UPDATE stock_transfers SET status='cancelled' WHERE id=$1 AND status='draft' RETURNING transfer_number`,
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(400).json({ error: 'Transfer not found or cannot be cancelled' }); return; }
    res.json({ message: 'Transfer cancelled' });
  } catch (err) { next(err); }
});

export default router;
