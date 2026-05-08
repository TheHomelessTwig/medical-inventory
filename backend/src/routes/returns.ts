/**
 * Stock returns to supplier.
 * GET  /api/returns              - list
 * GET  /api/returns/:id          - detail
 * POST /api/returns              - create draft
 * PUT  /api/returns/:id          - update draft
 * POST /api/returns/:id/confirm  - confirm (restores stock)
 * DELETE /api/returns/:id        - delete draft
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { authenticate, requireAdmin, requireAdminOrNurse } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const returnSchema = z.object({
  supplier_id:   z.string().uuid().optional().nullable(),
  supplier_name: z.string().min(1),
  notes:         z.string().optional().nullable(),
  items: z.array(z.object({
    inventory_item_id: z.string().uuid(),
    item_name:    z.string(),
    batch_id:     z.string().uuid().optional().nullable(),
    batch_number: z.string().optional().nullable(),
    quantity:     z.number().positive(),
    unit_cost:    z.number().min(0).optional().nullable(),
    reason:       z.string().optional().nullable(),
  })).min(1),
});

// GET /api/returns
router.get('/', requireAdminOrNurse, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.query as Record<string, string>;
    const params: unknown[] = [];
    let where = '';
    if (status) { where = 'WHERE sr.status = $1'; params.push(status); }

    const result = await query(`
      SELECT sr.*, u.name as created_by_name, c.name as confirmed_by_name,
             (SELECT COUNT(*) FROM stock_return_items ri WHERE ri.return_id = sr.id) as item_count
      FROM stock_returns sr
      LEFT JOIN users u ON sr.created_by = u.id
      LEFT JOIN users c ON sr.confirmed_by = c.id
      ${where}
      ORDER BY sr.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/returns/:id
router.get('/:id', requireAdminOrNurse, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [header, items] = await Promise.all([
      query(`SELECT sr.*, u.name as created_by_name, c.name as confirmed_by_name
             FROM stock_returns sr
             LEFT JOIN users u ON sr.created_by = u.id
             LEFT JOIN users c ON sr.confirmed_by = c.id
             WHERE sr.id = $1`, [req.params.id]),
      query(`SELECT ri.*, i.unit FROM stock_return_items ri
             JOIN inventory_items i ON ri.inventory_item_id = i.id
             WHERE ri.return_id = $1`, [req.params.id]),
    ]);
    if (header.rows.length === 0) { res.status(404).json({ error: 'Return not found' }); return; }
    res.json({ ...header.rows[0], items: items.rows });
  } catch (err) { next(err); }
});

// POST /api/returns — create draft
router.post('/', requireAdminOrNurse, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = returnSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      const seqRes = await client.query(`SELECT nextval('return_number_seq') as seq`);
      const returnNum = `RET-${String(seqRes.rows[0].seq).padStart(6, '0')}`;

      const hdr = await client.query(`
        INSERT INTO stock_returns (return_number, supplier_id, supplier_name, notes, created_by)
        VALUES ($1,$2,$3,$4,$5) RETURNING id, return_number
      `, [returnNum, body.supplier_id, body.supplier_name, body.notes, req.user!.id]);

      const returnId = hdr.rows[0].id;
      for (const item of body.items) {
        await client.query(`
          INSERT INTO stock_return_items
            (return_id, inventory_item_id, item_name, batch_id, batch_number, quantity, unit_cost, reason)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [returnId, item.inventory_item_id, item.item_name, item.batch_id, item.batch_number,
            item.quantity, item.unit_cost, item.reason]);
      }

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({ user: req.user, action: 'RETURN_CREATED', entityType: 'stock_return', entityId: returnId, entityName: returnNum, newValues: body, ipAddress, userAgent }, client);
      return { id: returnId, return_number: returnNum };
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

// PUT /api/returns/:id — update draft
router.put('/:id', requireAdminOrNurse, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await query(`SELECT * FROM stock_returns WHERE id = $1`, [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ error: 'Return not found' }); return; }
    if (existing.rows[0].status !== 'draft') { res.status(400).json({ error: 'Only draft returns can be edited' }); return; }

    const body = returnSchema.partial().parse(req.body);
    await query(`UPDATE stock_returns SET supplier_id=$1, supplier_name=COALESCE($2,supplier_name), notes=$3 WHERE id=$4`,
      [body.supplier_id ?? existing.rows[0].supplier_id, body.supplier_name, body.notes ?? existing.rows[0].notes, req.params.id]);

    if (body.items) {
      await query(`DELETE FROM stock_return_items WHERE return_id=$1`, [req.params.id]);
      for (const item of body.items) {
        await query(`INSERT INTO stock_return_items (return_id,inventory_item_id,item_name,batch_id,batch_number,quantity,unit_cost,reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [req.params.id, item.inventory_item_id, item.item_name, item.batch_id, item.batch_number, item.quantity, item.unit_cost, item.reason]);
      }
    }
    res.json({ message: 'Return updated' });
  } catch (err) { next(err); }
});

// POST /api/returns/:id/confirm — restore stock and mark confirmed
router.post('/:id/confirm', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await withTransaction(async (client) => {
      const hdr = await client.query(`SELECT * FROM stock_returns WHERE id=$1 AND status='draft' FOR UPDATE`, [req.params.id]);
      if (hdr.rows.length === 0) throw createError('Return not found or already confirmed', 404);

      const items = await client.query(`SELECT * FROM stock_return_items WHERE return_id=$1`, [req.params.id]);

      for (const item of items.rows) {
        // Lock and restore item qty
        await client.query(`SELECT quantity_on_hand FROM inventory_items WHERE id=$1 FOR UPDATE`, [item.inventory_item_id]);
        await client.query(`UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE id=$2`,
          [item.quantity, item.inventory_item_id]);

        // Restore batch qty if specified
        if (item.batch_id) {
          await client.query(`UPDATE inventory_batches SET quantity = quantity + $1 WHERE id=$2`,
            [item.quantity, item.batch_id]);
        }

        // Stock adjustment record
        await client.query(`INSERT INTO stock_adjustments (inventory_item_id, batch_id, adjusted_by, adjustment_type, quantity_change, reason, reference_type)
          VALUES ($1,$2,$3,'return',$4,$5,'stock_return')`,
          [item.inventory_item_id, item.batch_id, req.user!.id, item.quantity, `Return ${hdr.rows[0].return_number}`]);
      }

      await client.query(`UPDATE stock_returns SET status='confirmed', confirmed_by=$1, confirmed_at=NOW() WHERE id=$2`,
        [req.user!.id, req.params.id]);

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({ user: req.user, action: 'RETURN_CONFIRMED', entityType: 'stock_return', entityId: req.params.id, entityName: hdr.rows[0].return_number, ipAddress, userAgent }, client);
    });
    res.json({ message: 'Return confirmed — stock restored' });
  } catch (err) { next(err); }
});

// DELETE /api/returns/:id — delete draft
router.delete('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`DELETE FROM stock_returns WHERE id=$1 AND status='draft' RETURNING return_number`, [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Draft return not found' }); return; }
    res.json({ message: 'Return deleted' });
  } catch (err) { next(err); }
});

export default router;
