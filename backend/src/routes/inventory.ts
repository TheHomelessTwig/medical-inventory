import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { query, withTransaction } from '../db';
import { authenticate, requireAdmin, requireAdminOrNurse } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const itemSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category_id: z.string().uuid().optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  barcode: z.string().max(100).optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  unit: z.string().default('unit'),
  reorder_threshold: z.number().min(0).default(0),
  internal_price: z.number().min(0).optional().nullable(),
  supplier_cost: z.number().min(0).optional().nullable(),
  gst_applicable: z.boolean().default(true),
  gst_rate: z.number().min(0).max(100).default(10),
  storage_location: z.string().max(255).optional().nullable(),
  requires_batch_tracking: z.boolean().default(false),
  dispense_unit: z.number().min(0.001).max(10000).default(1),
  notes: z.string().optional().nullable(),
});

const adjustSchema = z.object({
  quantity_change: z.number(),
  adjustment_type: z.enum(['increase', 'decrease', 'correction', 'damage', 'expiry', 'return', 'other', 'wastage']),
  reason: z.string().min(1),
  batch_id: z.string().uuid().optional().nullable(),
  override_negative: z.boolean().default(false),
  wastage_reason: z.enum(['dropped','contaminated','opened_unused','incorrect_dose','expired_opened','other']).optional().nullable(),
});

// GET /api/inventory
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      page = '1', limit = '50', search = '', category = '', low_stock = '', expiring = '',
      active = 'true', sort = 'name', order = 'asc',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (active !== 'all') {
      conditions.push(`i.is_active = $${p++}`);
      params.push(active === 'true');
    }

    if (search) {
      conditions.push(`(i.name ILIKE $${p} OR i.sku ILIKE $${p} OR i.barcode ILIKE $${p} OR i.description ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    if (category) {
      conditions.push(`i.category_id = $${p++}`);
      params.push(category);
    }

    if (low_stock === 'true') {
      conditions.push(`i.quantity_on_hand <= i.reorder_threshold AND i.reorder_threshold > 0`);
    }

    if (expiring) {
      const days = parseInt(expiring) || 30;
      conditions.push(`EXISTS (
        SELECT 1 FROM inventory_batches b
        WHERE b.inventory_item_id = i.id
        AND b.expiry_date IS NOT NULL
        AND b.expiry_date <= CURRENT_DATE + INTERVAL '${days} days'
        AND b.expiry_date >= CURRENT_DATE
        AND b.quantity > 0
      )`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSort = ['name', 'sku', 'quantity_on_hand', 'internal_price', 'created_at', 'updated_at'];
    const sortCol = allowedSort.includes(sort) ? sort : 'name';
    const sortDir = order === 'desc' ? 'DESC' : 'ASC';

    const countResult = await query(
      `SELECT COUNT(*) FROM inventory_items i ${where}`,
      params
    );

    const dataResult = await query(
      `SELECT
        i.*,
        c.name as category_name, c.color as category_color,
        s.name as supplier_name,
        (i.quantity_on_hand <= i.reorder_threshold AND i.reorder_threshold > 0) as is_low_stock,
        (SELECT MIN(b.expiry_date) FROM inventory_batches b
         WHERE b.inventory_item_id = i.id AND b.expiry_date IS NOT NULL AND b.quantity > 0
         AND b.expiry_date >= CURRENT_DATE) as nearest_expiry
       FROM inventory_items i
       LEFT JOIN categories c ON i.category_id = c.id
       LEFT JOIN suppliers s ON i.supplier_id = s.id
       ${where}
       ORDER BY i.${sortCol} ${sortDir}
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      items: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/export
router.get('/export', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT
        i.name, i.description, c.name as category, i.sku, i.barcode,
        s.name as supplier, i.unit, i.quantity_on_hand, i.reorder_threshold,
        i.internal_price, i.supplier_cost, i.gst_applicable, i.gst_rate,
        i.storage_location, i.requires_batch_tracking, i.notes,
        i.is_active, i.created_at
      FROM inventory_items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      ORDER BY i.name
    `);

    const csv = stringify(result.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inventory_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/import
router.post('/import', requireAdmin, upload.single('file'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const records = parse(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        if (!row.name) {
          errors.push(`Row ${i + 2}: Missing name`);
          continue;
        }

        let categoryId = null;
        if (row.category) {
          const cat = await query('SELECT id FROM categories WHERE name ILIKE $1', [row.category]);
          categoryId = cat.rows[0]?.id ?? null;
        }

        let supplierId = null;
        if (row.supplier) {
          const sup = await query('SELECT id FROM suppliers WHERE name ILIKE $1', [row.supplier]);
          supplierId = sup.rows[0]?.id ?? null;
        }

        await query(`
          INSERT INTO inventory_items
            (name, description, category_id, sku, barcode, supplier_id, unit,
             quantity_on_hand, reorder_threshold, internal_price, supplier_cost,
             storage_location, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (sku) DO NOTHING
        `, [
          row.name, row.description || null, categoryId,
          row.sku || null, row.barcode || null, supplierId,
          row.unit || 'unit',
          parseFloat(row.quantity_on_hand) || 0,
          parseFloat(row.reorder_threshold) || 0,
          row.internal_price ? parseFloat(row.internal_price) : null,
          row.supplier_cost ? parseFloat(row.supplier_cost) : null,
          row.storage_location || null, row.notes || null,
          req.user!.id,
        ]);
        created++;
      } catch {
        errors.push(`Row ${i + 2}: Import failed`);
        skipped++;
      }
    }

    await logAudit({
      user: req.user,
      action: 'INVENTORY_IMPORT',
      newValues: { created, skipped, total: records.length },
      ...getClientInfo(req),
    });

    res.json({ message: `Import complete: ${created} created, ${skipped} skipped`, errors });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT
        i.*,
        c.name as category_name, c.color as category_color,
        s.name as supplier_name, s.email as supplier_email, s.phone as supplier_phone
      FROM inventory_items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const batches = await query(
      `SELECT * FROM inventory_batches WHERE inventory_item_id = $1 AND is_active = true ORDER BY expiry_date ASC NULLS LAST`,
      [req.params.id]
    );

    const movements = await query(`
      SELECT sa.*, u.name as adjusted_by_name
      FROM stock_adjustments sa
      LEFT JOIN users u ON sa.adjusted_by = u.id
      WHERE sa.inventory_item_id = $1
      ORDER BY sa.created_at DESC LIMIT 20
    `, [req.params.id]);

    res.json({
      ...result.rows[0],
      batches: batches.rows,
      recent_movements: movements.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory
router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = itemSchema.parse(req.body);
    const result = await query(`
      INSERT INTO inventory_items
        (name, description, category_id, sku, barcode, supplier_id, unit,
         reorder_threshold, internal_price, supplier_cost, gst_applicable, gst_rate,
         storage_location, requires_batch_tracking, dispense_unit, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      body.name, body.description, body.category_id, body.sku, body.barcode,
      body.supplier_id, body.unit, body.reorder_threshold, body.internal_price,
      body.supplier_cost, body.gst_applicable, body.gst_rate,
      body.storage_location, body.requires_batch_tracking, body.dispense_unit,
      body.notes, req.user!.id,
    ]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'INVENTORY_CREATED',
      entityType: 'inventory_item',
      entityId: result.rows[0].id,
      entityName: body.name,
      newValues: body,
      ipAddress,
      userAgent,
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});

// PUT /api/inventory/:id
router.put('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = itemSchema.partial().parse(req.body);

    const existing = await query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const result = await query(`
      UPDATE inventory_items SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        category_id = $3,
        sku = $4,
        barcode = $5,
        supplier_id = $6,
        unit = COALESCE($7, unit),
        reorder_threshold = COALESCE($8, reorder_threshold),
        internal_price = $9,
        supplier_cost = $10,
        gst_applicable = COALESCE($11, gst_applicable),
        gst_rate = COALESCE($12, gst_rate),
        storage_location = $13,
        requires_batch_tracking = COALESCE($14, requires_batch_tracking),
        dispense_unit = COALESCE($15, dispense_unit),
        notes = $16,
        is_active = COALESCE($17, is_active)
      WHERE id = $18
      RETURNING *
    `, [
      body.name, body.description, body.category_id ?? existing.rows[0].category_id,
      body.sku ?? existing.rows[0].sku, body.barcode ?? existing.rows[0].barcode,
      body.supplier_id ?? existing.rows[0].supplier_id,
      body.unit, body.reorder_threshold, body.internal_price ?? existing.rows[0].internal_price,
      body.supplier_cost ?? existing.rows[0].supplier_cost,
      body.gst_applicable, body.gst_rate, body.storage_location ?? existing.rows[0].storage_location,
      body.requires_batch_tracking, body.dispense_unit,
      body.notes ?? existing.rows[0].notes,
      (req.body as Record<string, unknown>).is_active ?? existing.rows[0].is_active,
      req.params.id,
    ]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'INVENTORY_UPDATED',
      entityType: 'inventory_item',
      entityId: req.params.id,
      entityName: result.rows[0].name,
      oldValues: existing.rows[0],
      newValues: result.rows[0],
      ipAddress,
      userAgent,
    });

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});

// DELETE /api/inventory/:id (archive)
router.delete('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      'UPDATE inventory_items SET is_active = false WHERE id = $1 RETURNING name',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'INVENTORY_ARCHIVED',
      entityType: 'inventory_item',
      entityId: req.params.id,
      entityName: result.rows[0].name,
      ipAddress,
      userAgent,
    });

    res.json({ message: 'Item archived' });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/:id/adjust
router.post('/:id/adjust', requireAdminOrNurse, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = adjustSchema.parse(req.body);

    await withTransaction(async (client) => {
      const itemResult = await client.query(
        'SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      if (itemResult.rows.length === 0) throw createError('Item not found', 404);

      const item = itemResult.rows[0];
      const qtyBefore = parseFloat(item.quantity_on_hand);
      const qtyAfter = qtyBefore + body.quantity_change;

      if (qtyAfter < 0 && !body.override_negative) {
        throw createError(`Adjustment would result in negative stock (${qtyAfter}). Use override to force.`, 400);
      }

      await client.query(
        'UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2',
        [qtyAfter, req.params.id]
      );

      if (body.batch_id) {
        const batchBefore = await client.query(
          'SELECT quantity FROM inventory_batches WHERE id = $1 FOR UPDATE',
          [body.batch_id]
        );
        if (batchBefore.rows.length > 0) {
          const batchQtyAfter = parseFloat(batchBefore.rows[0].quantity) + body.quantity_change;
          await client.query(
            'UPDATE inventory_batches SET quantity = $1 WHERE id = $2',
            [Math.max(0, batchQtyAfter), body.batch_id]
          );
        }
      }

      await client.query(`
        INSERT INTO stock_adjustments
          (inventory_item_id, batch_id, adjusted_by, adjustment_type,
           quantity_before, quantity_change, quantity_after, reason, override_negative, wastage_reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        req.params.id, body.batch_id, req.user!.id, body.adjustment_type,
        qtyBefore, body.quantity_change, qtyAfter, body.reason, body.override_negative,
        body.wastage_reason ?? null,
      ]);

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'STOCK_ADJUSTED',
        entityType: 'inventory_item',
        entityId: req.params.id,
        entityName: item.name,
        oldValues: { quantity: qtyBefore },
        newValues: { quantity: qtyAfter, change: body.quantity_change, reason: body.reason },
        ipAddress,
        userAgent,
      }, client);
    });

    const updated = await query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
    res.json({ message: 'Stock adjusted', item: updated.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});

// GET /api/inventory/:id/batches
router.get('/:id/batches', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT * FROM inventory_batches WHERE inventory_item_id = $1 ORDER BY expiry_date ASC NULLS LAST`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/:id/batches
router.post('/:id/batches', requireAdminOrNurse, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { batch_number, lot_number, expiry_date, quantity, supplier_cost, received_date, notes } = req.body;

    if (!batch_number || quantity === undefined) {
      res.status(400).json({ error: 'batch_number and quantity are required' });
      return;
    }

    const result = await query(`
      INSERT INTO inventory_batches
        (inventory_item_id, batch_number, lot_number, expiry_date, quantity, supplier_cost, received_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [req.params.id, batch_number, lot_number, expiry_date, quantity, supplier_cost, received_date, notes]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/inventory/bulk — bulk archive/activate/reassign (admin only)
router.patch('/bulk', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const bulkSchema = z.object({
      ids: z.array(z.string().uuid()).min(1).max(200),
      action: z.enum(['archive', 'activate', 'reassign_category']),
      category_id: z.string().uuid().optional().nullable(),
    });
    const body = bulkSchema.parse(req.body);

    if (body.action === 'reassign_category' && body.category_id === undefined) {
      res.status(400).json({ error: 'category_id is required for reassign_category' }); return;
    }

    let sql: string;
    let params: unknown[];

    if (body.action === 'archive') {
      sql = `UPDATE inventory_items SET is_active=false WHERE id=ANY($1::uuid[])`;
      params = [body.ids];
    } else if (body.action === 'activate') {
      sql = `UPDATE inventory_items SET is_active=true WHERE id=ANY($1::uuid[])`;
      params = [body.ids];
    } else {
      sql = `UPDATE inventory_items SET category_id=$2 WHERE id=ANY($1::uuid[])`;
      params = [body.ids, body.category_id];
    }

    const result = await query(sql + ' RETURNING id', params);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: `BULK_${body.action.toUpperCase()}`, newValues: { count: result.rowCount, action: body.action }, ipAddress, userAgent });

    res.json({ message: `${result.rowCount} item(s) updated`, count: result.rowCount });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

export default router;
