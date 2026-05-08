import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { stringify } from 'csv-stringify/sync';
import { query, withTransaction } from '../db';
import { authenticate, requireAdminOrNurse } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate, requireAdminOrNurse);

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['full', 'cycle', 'partial']),
  scope_description: z.string().optional().nullable(),
  scope_category_id: z.string().uuid().optional().nullable(),
  scope_location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  item_ids: z.array(z.string().uuid()).optional(),
});

const countSchema = z.object({
  counted_quantity: z.number().min(0),
  notes: z.string().optional().nullable(),
});

// GET /api/stocktakes
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (status) {
      conditions.push(`s.status = $${p++}`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) FROM stocktakes s ${where}`, params);
    const result = await query(`
      SELECT s.*, u.name as created_by_name, cb.name as completed_by_name
      FROM stocktakes s
      JOIN users u ON s.created_by = u.id
      LEFT JOIN users cb ON s.completed_by = cb.id
      ${where}
      ORDER BY s.started_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limitNum, offset]);

    res.json({
      stocktakes: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: pageNum,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/stocktakes
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = createSchema.parse(req.body);

    const stocktakeId = await withTransaction(async (client) => {
      const result = await client.query(`
        INSERT INTO stocktakes (name, type, scope_description, scope_category_id, scope_location, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
      `, [body.name, body.type, body.scope_description, body.scope_category_id, body.scope_location, body.notes, req.user!.id]);

      const stocktakeId = result.rows[0].id;

      // Determine which items to include
      let itemQuery = `SELECT id, quantity_on_hand FROM inventory_items WHERE is_active = true`;
      const itemParams: unknown[] = [];
      let ip = 1;

      if (body.type === 'partial') {
        if (body.scope_category_id) {
          itemQuery += ` AND category_id = $${ip++}`;
          itemParams.push(body.scope_category_id);
        } else if (body.scope_location) {
          itemQuery += ` AND storage_location ILIKE $${ip++}`;
          itemParams.push(`%${body.scope_location}%`);
        } else if (body.item_ids && body.item_ids.length > 0) {
          itemQuery += ` AND id = ANY($${ip++}::uuid[])`;
          itemParams.push(body.item_ids);
        }
      }

      const items = await client.query(itemQuery, itemParams);

      for (const item of items.rows) {
        await client.query(`
          INSERT INTO stocktake_items (stocktake_id, inventory_item_id, expected_quantity)
          VALUES ($1,$2,$3)
        `, [stocktakeId, item.id, item.quantity_on_hand]);
      }

      await client.query(
        'UPDATE stocktakes SET total_items = $1 WHERE id = $2',
        [items.rows.length, stocktakeId]
      );

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'STOCKTAKE_CREATED',
        entityType: 'stocktake',
        entityId: stocktakeId,
        entityName: body.name,
        newValues: { type: body.type, item_count: items.rows.length },
        ipAddress,
        userAgent,
      }, client);

      return stocktakeId;
    });

    const stocktake = await query('SELECT * FROM stocktakes WHERE id = $1', [stocktakeId]);
    res.status(201).json(stocktake.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});

// GET /api/stocktakes/:id   ?format=csv for export
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { format } = req.query as Record<string, string>;

    const result = await query(`
      SELECT s.*, u.name as created_by_name, cb.name as completed_by_name
      FROM stocktakes s
      JOIN users u ON s.created_by = u.id
      LEFT JOIN users cb ON s.completed_by = cb.id
      WHERE s.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Stocktake not found' });
      return;
    }

    const items = await query(`
      SELECT si.*, i.name as item_name, i.sku, i.unit, i.storage_location,
             c.name as category_name, u.name as counted_by_name
      FROM stocktake_items si
      JOIN inventory_items i ON si.inventory_item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN users u ON si.counted_by = u.id
      WHERE si.stocktake_id = $1
      ORDER BY i.name
    `, [req.params.id]);

    // CSV export  ← NEW
    if (format === 'csv') {
      const st = result.rows[0];
      const rows = items.rows.map(r => ({
        item_name: r.item_name,
        sku: r.sku || '',
        category: r.category_name || '',
        storage_location: r.storage_location || '',
        unit: r.unit,
        expected_quantity: r.expected_quantity ?? '',
        counted_quantity: r.counted_quantity ?? '',
        variance: r.variance ?? '',
        adjustment_applied: r.adjustment_applied ? 'Yes' : 'No',
        counted_by: r.counted_by_name || '',
        counted_at: r.counted_at ? String(r.counted_at).slice(0, 16) : '',
        notes: r.notes || '',
      }));
      const csv = stringify(rows, { header: true });
      const safeName = st.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="stocktake_${safeName}_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
      return;
    }

    const counted = items.rows.filter(i => i.counted_quantity !== null).length;
    const total = items.rows.length;

    res.json({
      ...result.rows[0],
      items: items.rows,
      progress: { counted, total, percentage: total > 0 ? Math.round((counted / total) * 100) : 0 },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/stocktakes/:id/items/:itemId
router.put('/:id/items/:itemId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = countSchema.parse(req.body);

    const stocktake = await query(
      'SELECT status FROM stocktakes WHERE id = $1',
      [req.params.id]
    );
    if (stocktake.rows.length === 0 || stocktake.rows[0].status !== 'in_progress') {
      res.status(400).json({ error: 'Stocktake not found or not in progress' });
      return;
    }

    const result = await query(`
      UPDATE stocktake_items
      SET counted_quantity = $1, notes = $2, counted_at = NOW(), counted_by = $3
      WHERE id = $4 AND stocktake_id = $5
      RETURNING *
    `, [body.counted_quantity, body.notes, req.user!.id, req.params.itemId, req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Stocktake item not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});

// POST /api/stocktakes/:id/complete
router.post('/:id/complete', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { apply_adjustments = true, notes } = req.body;

    await withTransaction(async (client) => {
      const stocktake = await client.query(
        `SELECT * FROM stocktakes WHERE id = $1 AND status = 'in_progress' FOR UPDATE`,
        [req.params.id]
      );
      if (stocktake.rows.length === 0) throw createError('Stocktake not found or not in progress', 404);

      const items = await client.query(`
        SELECT si.*, i.quantity_on_hand as current_qty, i.name as item_name
        FROM stocktake_items si
        JOIN inventory_items i ON si.inventory_item_id = i.id
        WHERE si.stocktake_id = $1 AND si.counted_quantity IS NOT NULL
      `, [req.params.id]);

      let totalVariance = 0;

      for (const item of items.rows) {
        const variance = parseFloat(item.counted_quantity) - parseFloat(item.expected_quantity ?? item.current_qty);
        totalVariance += Math.abs(variance);

        if (apply_adjustments && variance !== 0) {
          await client.query(
            `UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2`,
            [item.counted_quantity, item.inventory_item_id]
          );

          await client.query(`
            INSERT INTO stock_adjustments
              (inventory_item_id, adjusted_by, adjustment_type, quantity_before, quantity_change, quantity_after, reason, reference_id, reference_type)
            VALUES ($1,$2,'stocktake',$3,$4,$5,$6,$7,'stocktake')
          `, [
            item.inventory_item_id, req.user!.id,
            item.expected_quantity ?? item.current_qty,
            variance, item.counted_quantity,
            `Stocktake adjustment: ${stocktake.rows[0].name}`,
            req.params.id,
          ]);

          await client.query(
            `UPDATE stocktake_items SET adjustment_applied = true WHERE id = $1`,
            [item.id]
          );
        }
      }

      await client.query(`
        UPDATE stocktakes
        SET status = 'completed', completed_by = $1, completed_at = NOW(),
            notes = COALESCE($2, notes), total_variance = $3
        WHERE id = $4
      `, [req.user!.id, notes, totalVariance, req.params.id]);

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'STOCKTAKE_COMPLETED',
        entityType: 'stocktake',
        entityId: req.params.id,
        entityName: stocktake.rows[0].name,
        newValues: { applied: apply_adjustments, total_variance: totalVariance },
        ipAddress,
        userAgent,
      }, client);
    });

    const updated = await query('SELECT * FROM stocktakes WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/stocktakes/:id/cancel
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `UPDATE stocktakes SET status = 'cancelled' WHERE id = $1 AND status = 'in_progress' RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Stocktake not found or already completed' });
      return;
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'STOCKTAKE_CANCELLED',
      entityType: 'stocktake',
      entityId: req.params.id,
      ipAddress,
      userAgent,
    });

    res.json({ message: 'Stocktake cancelled' });
  } catch (err) {
    next(err);
  }
});

export default router;
