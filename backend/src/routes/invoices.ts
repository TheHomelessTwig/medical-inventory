import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { stringify } from 'csv-stringify/sync';
import { query, withTransaction } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate, requireAdmin);

const invoiceSchema = z.object({
  invoice_number: z.string().min(1).max(100),
  supplier_id: z.string().uuid().optional().nullable(),
  supplier_name: z.string().min(1).max(255),
  invoice_date: z.string().optional().nullable(),
  received_date: z.string(),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    inventory_item_id: z.string().uuid().optional().nullable(),
    item_name: z.string().min(1),
    batch_number: z.string().optional().nullable(),
    lot_number: z.string().optional().nullable(),
    expiry_date: z.string().optional().nullable(),
    quantity: z.number().positive(),
    unit_cost: z.number().min(0),
    gst_applicable: z.boolean().default(true),
    notes: z.string().optional().nullable(),
  })).min(1),
});

// GET /api/invoices
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, supplier, page = '1', limit = '20', search = '' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (status) {
      conditions.push(`i.status = $${p++}`);
      params.push(status);
    }
    if (supplier) {
      conditions.push(`i.supplier_id = $${p++}`);
      params.push(supplier);
    }
    if (search) {
      conditions.push(`(i.invoice_number ILIKE $${p} OR i.supplier_name ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) FROM invoices i ${where}`, params);
    const result = await query(`
      SELECT i.*, u.name as entered_by_name, pb.name as posted_by_name,
             COUNT(ii.id) as line_count
      FROM invoices i
      JOIN users u ON i.entered_by = u.id
      LEFT JOIN users pb ON i.posted_by = pb.id
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      ${where}
      GROUP BY i.id, u.name, pb.name
      ORDER BY i.received_date DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limitNum, offset]);

    res.json({
      invoices: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: pageNum,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/invoices/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT i.*, u.name as entered_by_name, pb.name as posted_by_name,
             s.contact_name as supplier_contact, s.email as supplier_email
      FROM invoices i
      JOIN users u ON i.entered_by = u.id
      LEFT JOIN users pb ON i.posted_by = pb.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const items = await query(`
      SELECT ii.*, inv.name as item_name_resolved, inv.unit
      FROM invoice_items ii
      LEFT JOIN inventory_items inv ON ii.inventory_item_id = inv.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.id
    `, [req.params.id]);

    res.json({ ...result.rows[0], items: items.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/invoices
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = invoiceSchema.parse(req.body);

    // Check duplicate invoice number
    const existing = await query('SELECT id FROM invoices WHERE invoice_number = $1', [body.invoice_number]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: `Invoice number ${body.invoice_number} already exists` });
      return;
    }

    const gstRate = 0.10;
    let subtotal = 0;
    let gstTotal = 0;

    const processedItems = body.items.map(item => {
      const lineTotal = item.quantity * item.unit_cost;
      const gstAmount = item.gst_applicable ? lineTotal * gstRate : 0;
      subtotal += lineTotal;
      gstTotal += gstAmount;
      return { ...item, lineTotal, gstAmount };
    });

    const invoiceId = await withTransaction(async (client) => {
      const result = await client.query(`
        INSERT INTO invoices
          (invoice_number, supplier_id, supplier_name, invoice_date, received_date,
           due_date, subtotal, gst_amount, total_value, notes, entered_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING id
      `, [
        body.invoice_number, body.supplier_id, body.supplier_name,
        body.invoice_date, body.received_date, body.due_date,
        subtotal, gstTotal, subtotal + gstTotal, body.notes, req.user!.id,
      ]);

      const invoiceId = result.rows[0].id;

      for (const item of processedItems) {
        await client.query(`
          INSERT INTO invoice_items
            (invoice_id, inventory_item_id, item_name, batch_number, lot_number,
             expiry_date, quantity, unit_cost, gst_applicable, gst_amount, total_cost, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `, [
          invoiceId, item.inventory_item_id, item.item_name,
          item.batch_number, item.lot_number, item.expiry_date,
          item.quantity, item.unit_cost, item.gst_applicable,
          item.gstAmount, item.lineTotal, item.notes,
        ]);
      }

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'INVOICE_CREATED',
        entityType: 'invoice',
        entityId: invoiceId,
        entityName: body.invoice_number,
        newValues: { supplier: body.supplier_name, total: subtotal + gstTotal },
        ipAddress,
        userAgent,
      }, client);

      return invoiceId;
    });

    const invoice = await query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    res.status(201).json(invoice.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});

// POST /api/invoices/:id/post (apply stock updates)
router.post('/:id/post', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await withTransaction(async (client) => {
      const invoice = await client.query(
        `SELECT * FROM invoices WHERE id = $1 AND status IN ('received', 'verified') FOR UPDATE`,
        [req.params.id]
      );
      if (invoice.rows.length === 0) throw createError('Invoice not found or already posted', 404);

      const items = await client.query(
        'SELECT * FROM invoice_items WHERE invoice_id = $1 AND stock_updated = false',
        [req.params.id]
      );

      for (const item of items.rows) {
        if (!item.inventory_item_id) continue;

        // Update stock quantity
        await client.query(
          `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE id = $2`,
          [item.quantity, item.inventory_item_id]
        );

        // Update supplier cost if provided
        if (item.unit_cost > 0) {
          await client.query(
            `UPDATE inventory_items SET supplier_cost = $1 WHERE id = $2`,
            [item.unit_cost, item.inventory_item_id]
          );
        }

        // Create batch record if batch info provided
        if (item.batch_number) {
          await client.query(`
            INSERT INTO inventory_batches
              (inventory_item_id, batch_number, lot_number, expiry_date, quantity, supplier_cost, invoice_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (inventory_item_id, batch_number)
            DO UPDATE SET quantity = inventory_batches.quantity + $5
          `, [
            item.inventory_item_id, item.batch_number, item.lot_number,
            item.expiry_date, item.quantity, item.unit_cost, req.params.id,
          ]);
        }

        // Record adjustment
        await client.query(`
          INSERT INTO stock_adjustments
            (inventory_item_id, adjusted_by, adjustment_type, quantity_change, reason, reference_id, reference_type)
          VALUES ($1,$2,'increase',$3,$4,$5,'invoice')
        `, [
          item.inventory_item_id, req.user!.id, item.quantity,
          `Stock received from invoice ${invoice.rows[0].invoice_number}`,
          req.params.id,
        ]);

        await client.query(
          'UPDATE invoice_items SET stock_updated = true WHERE id = $1',
          [item.id]
        );
      }

      await client.query(
        `UPDATE invoices SET status = 'posted', posted_by = $1, posted_at = NOW() WHERE id = $2`,
        [req.user!.id, req.params.id]
      );

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'INVOICE_POSTED',
        entityType: 'invoice',
        entityId: req.params.id,
        entityName: invoice.rows[0].invoice_number,
        ipAddress,
        userAgent,
      }, client);
    });

    const updated = await query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/invoices/:id (update before posting)
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await query(
      `SELECT status FROM invoices WHERE id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    if (existing.rows[0].status === 'posted') {
      res.status(400).json({ error: 'Cannot edit a posted invoice' });
      return;
    }

    const { notes, status } = req.body;
    const allowedStatuses = ['received', 'verified'];
    if (status && !allowedStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const result = await query(
      `UPDATE invoices SET notes = COALESCE($1, notes), status = COALESCE($2, status) WHERE id = $3 RETURNING *`,
      [notes, status, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/invoices/xero-export?from=&to= — Xero bank transactions CSV format
router.get('/xero-export', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { from = '', to = '' } = req.query as Record<string, string>;
    const params: unknown[] = [];
    let where = "WHERE inv.status IN ('posted','verified')";
    if (from) { params.push(from); where += ` AND inv.invoice_date >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND inv.invoice_date <= $${params.length}`; }

    const result = await query(`
      SELECT
        inv.invoice_date as "Date",
        inv.total_value as "Amount",
        inv.supplier_name as "Payee",
        COALESCE(inv.notes, 'Supplier invoice') as "Description",
        inv.invoice_number as "Reference",
        '' as "Cheque Number",
        'AUD' as "Currency"
      FROM invoices inv
      ${where}
      ORDER BY inv.invoice_date DESC
    `, params);

    const csv = stringify(result.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="xero_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
