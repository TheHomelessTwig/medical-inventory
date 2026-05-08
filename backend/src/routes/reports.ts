import { Router, Request, Response, NextFunction } from 'express';
import { stringify } from 'csv-stringify/sync';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/reports/dashboard
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [
      stockStats, requestStats, lowStock,
      expiringItems, recentActivity, topUsed, dailyUsage,
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*) as total_items,
          COUNT(*) FILTER (WHERE is_active) as active_items,
          SUM(quantity_on_hand * COALESCE(internal_price, 0)) as total_value,
          SUM(quantity_on_hand * COALESCE(supplier_cost, 0)) as total_cost_value,
          COUNT(*) FILTER (WHERE quantity_on_hand <= reorder_threshold AND reorder_threshold > 0 AND is_active) as low_stock_count
        FROM inventory_items
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
          COUNT(*) FILTER (WHERE status = 'fulfilled') as fulfilled_today
        FROM stock_requests WHERE created_at >= CURRENT_DATE
      `),
      query(`
        SELECT i.id, i.name, i.sku, i.quantity_on_hand, i.reorder_threshold, i.unit,
               c.name as category_name
        FROM inventory_items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.quantity_on_hand <= i.reorder_threshold AND i.reorder_threshold > 0 AND i.is_active = true
        ORDER BY (i.quantity_on_hand - i.reorder_threshold) ASC LIMIT 10
      `),
      query(`
        SELECT i.id, i.name, b.batch_number, b.expiry_date, b.quantity, i.unit
        FROM inventory_batches b
        JOIN inventory_items i ON b.inventory_item_id = i.id
        WHERE b.expiry_date IS NOT NULL AND b.expiry_date >= CURRENT_DATE
          AND b.expiry_date <= CURRENT_DATE + INTERVAL '60 days'
          AND b.quantity > 0 AND i.is_active = true
        ORDER BY b.expiry_date ASC LIMIT 10
      `),
      query(`
        SELECT al.action, al.entity_name, al.user_name, al.created_at
        FROM audit_log al
        WHERE al.action IN ('STOCK_ADJUSTED','REQUEST_FULFILLED','REQUEST_CREATED','INVOICE_POSTED')
        ORDER BY al.created_at DESC LIMIT 10
      `),
      query(`
        SELECT i.name, i.unit, SUM(sfi.quantity_used) as total_used
        FROM stock_fulfillment_items sfi
        JOIN inventory_items i ON sfi.inventory_item_id = i.id
        JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
        WHERE sf.completed_at >= NOW() - INTERVAL '30 days'
        GROUP BY i.id, i.name, i.unit
        ORDER BY total_used DESC LIMIT 10
      `),
      query(`
        SELECT DATE(sf.completed_at) as date, SUM(sfi.quantity_used) as qty_used, SUM(sfi.total_charge) as revenue
        FROM stock_fulfillment_items sfi
        JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
        WHERE sf.completed_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(sf.completed_at) ORDER BY date ASC
      `),
    ]);

    res.json({
      stock: stockStats.rows[0],
      requests_today: requestStats.rows[0],
      low_stock: lowStock.rows,
      expiring_soon: expiringItems.rows,
      recent_activity: recentActivity.rows,
      top_used: topUsed.rows,
      daily_usage: dailyUsage.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/reports/stock-on-hand
router.get('/stock-on-hand', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { category, format } = req.query as Record<string, string>;
    let sql = `
      SELECT i.name, i.sku, i.barcode, i.unit, c.name as category, s.name as supplier,
        i.quantity_on_hand, i.quantity_reserved,
        i.quantity_on_hand - i.quantity_reserved as quantity_available,
        i.reorder_threshold, i.internal_price, i.supplier_cost,
        i.quantity_on_hand * COALESCE(i.internal_price, 0) as value_at_sell,
        i.quantity_on_hand * COALESCE(i.supplier_cost, 0) as value_at_cost,
        i.storage_location, i.is_active,
        (SELECT MIN(b.expiry_date) FROM inventory_batches b
         WHERE b.inventory_item_id = i.id AND b.expiry_date IS NOT NULL
         AND b.quantity > 0 AND b.expiry_date >= CURRENT_DATE) as nearest_expiry
      FROM inventory_items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.is_active = true
    `;
    const params: unknown[] = [];
    if (category) { sql += ` AND i.category_id = $1`; params.push(category); }
    sql += ` ORDER BY c.name ASC NULLS LAST, i.name ASC`;
    const result = await query(sql, params);
    if (format === 'csv') {
      const csv = stringify(result.rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="stock_on_hand_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv); return;
    }
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/reports/low-stock
router.get('/low-stock', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { format } = req.query as Record<string, string>;
    const result = await query(`
      SELECT i.id, i.name, i.sku, i.unit, i.quantity_on_hand, i.reorder_threshold,
        i.quantity_on_hand - i.reorder_threshold as deficit,
        c.name as category, s.name as supplier,
        s.email as supplier_email, s.phone as supplier_phone
      FROM inventory_items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.quantity_on_hand <= i.reorder_threshold AND i.reorder_threshold > 0 AND i.is_active = true
      ORDER BY (i.quantity_on_hand - i.reorder_threshold) ASC
    `);
    if (format === 'csv') {
      const csv = stringify(result.rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="low_stock_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv); return;
    }
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/reports/expiring
router.get('/expiring', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { days = '60', format } = req.query as Record<string, string>;
    const result = await query(`
      SELECT i.name, i.sku, i.unit, i.storage_location,
        b.batch_number, b.lot_number, b.expiry_date, b.quantity,
        b.expiry_date - CURRENT_DATE as days_until_expiry, c.name as category
      FROM inventory_batches b
      JOIN inventory_items i ON b.inventory_item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE b.expiry_date IS NOT NULL AND b.expiry_date >= CURRENT_DATE
        AND b.expiry_date <= CURRENT_DATE + INTERVAL '${parseInt(days)} days'
        AND b.quantity > 0 AND i.is_active = true
      ORDER BY b.expiry_date ASC
    `);
    if (format === 'csv') {
      const csv = stringify(result.rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="expiring_stock_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv); return;
    }
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/reports/usage   group_by=item|doctor|nurse|category   period=day|week|month
router.get('/usage', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to = new Date().toISOString().split('T')[0],
      group_by = 'item',
      period,   // 'day' | 'week' | 'month' — for trend charts
      format,
    } = req.query as Record<string, string>;

    let sql = '';

    // Nurse fulfilment summary  ← NEW
    if (group_by === 'nurse') {
      sql = `
        SELECT
          u.name as nurse_name,
          COUNT(DISTINCT sf.id) as fulfillment_count,
          COUNT(DISTINCT sf.request_id) as requests_handled,
          SUM(sfi.quantity_used) as total_qty_used,
          SUM(sfi.total_charge) as total_charge
        FROM stock_fulfillment_items sfi
        JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
        JOIN users u ON sf.nurse_id = u.id
        WHERE DATE(sf.completed_at) BETWEEN $1 AND $2
        GROUP BY u.id, u.name
        ORDER BY total_charge DESC NULLS LAST
      `;
    } else if (group_by === 'doctor') {
      sql = `
        SELECT
          u.name as doctor_name,
          COUNT(DISTINCT sr.id) as request_count,
          SUM(sfi.quantity_used) as total_qty_used,
          SUM(sfi.total_charge) as total_charge
        FROM stock_fulfillment_items sfi
        JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
        JOIN stock_requests sr ON sf.request_id = sr.id
        JOIN users u ON sr.doctor_id = u.id
        WHERE DATE(sf.completed_at) BETWEEN $1 AND $2
        GROUP BY u.id, u.name
        ORDER BY total_charge DESC NULLS LAST
      `;
    } else if (group_by === 'category') {
      sql = `
        SELECT
          c.name as category_name,
          SUM(sfi.quantity_used) as total_qty_used,
          SUM(sfi.total_charge) as total_charge,
          COUNT(DISTINCT sfi.inventory_item_id) as unique_items
        FROM stock_fulfillment_items sfi
        JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
        JOIN inventory_items i ON sfi.inventory_item_id = i.id
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE DATE(sf.completed_at) BETWEEN $1 AND $2
        GROUP BY c.id, c.name
        ORDER BY total_charge DESC NULLS LAST
      `;
    } else {
      // Default: by item
      sql = `
        SELECT
          i.name as item_name, i.sku, i.unit, c.name as category,
          SUM(sfi.quantity_used) as total_qty_used,
          AVG(sfi.internal_price) as avg_price,
          SUM(sfi.total_charge) as total_charge,
          COUNT(DISTINCT sf.id) as fulfillment_count
        FROM stock_fulfillment_items sfi
        JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
        JOIN inventory_items i ON sfi.inventory_item_id = i.id
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE DATE(sf.completed_at) BETWEEN $1 AND $2
        GROUP BY i.id, i.name, i.sku, i.unit, c.name
        ORDER BY total_qty_used DESC NULLS LAST
      `;
    }

    // Period trend override — weekly/monthly grouping  ← NEW
    let trendData = null;
    if (period && ['day', 'week', 'month'].includes(period)) {
      const truncUnit = period === 'day' ? 'day' : period === 'week' ? 'week' : 'month';
      const trendResult = await query(`
        SELECT
          DATE_TRUNC('${truncUnit}', sf.completed_at) as period_start,
          SUM(sfi.quantity_used) as qty_used,
          SUM(sfi.total_charge) as revenue,
          COUNT(DISTINCT sf.id) as fulfillment_count
        FROM stock_fulfillment_items sfi
        JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
        WHERE DATE(sf.completed_at) BETWEEN $1 AND $2
        GROUP BY DATE_TRUNC('${truncUnit}', sf.completed_at)
        ORDER BY period_start ASC
      `, [from, to]);
      trendData = trendResult.rows;
    }

    const result = await query(sql, [from, to]);

    if (format === 'csv') {
      const csv = stringify(result.rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="usage_${group_by}_${from}_to_${to}.csv"`);
      res.send(csv); return;
    }

    res.json({ data: result.rows, trend: trendData, from, to, group_by, period: period || null });
  } catch (err) { next(err); }
});

// GET /api/reports/valuation
router.get('/valuation', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { format } = req.query as Record<string, string>;
    const result = await query(`
      SELECT c.name as category, COUNT(i.id) as item_count,
        SUM(i.quantity_on_hand) as total_units,
        SUM(i.quantity_on_hand * COALESCE(i.supplier_cost, 0)) as cost_value,
        SUM(i.quantity_on_hand * COALESCE(i.internal_price, 0)) as sell_value,
        SUM(i.quantity_on_hand * (COALESCE(i.internal_price, 0) - COALESCE(i.supplier_cost, 0))) as gross_margin
      FROM inventory_items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.is_active = true
      GROUP BY c.id, c.name ORDER BY cost_value DESC NULLS LAST
    `);
    const totals = await query(`
      SELECT SUM(quantity_on_hand * COALESCE(supplier_cost, 0)) as total_cost,
             SUM(quantity_on_hand * COALESCE(internal_price, 0)) as total_sell
      FROM inventory_items WHERE is_active = true
    `);
    if (format === 'csv') {
      const csv = stringify(result.rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="valuation_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv); return;
    }
    res.json({ by_category: result.rows, totals: totals.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/reports/supplier-spend
router.get('/supplier-spend', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { from, to, format } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (from) { conditions.push(`i.received_date >= $${p++}`); params.push(from); }
    if (to) { conditions.push(`i.received_date <= $${p++}`); params.push(to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`
      SELECT i.supplier_name, COUNT(DISTINCT i.id) as invoice_count,
        SUM(i.subtotal) as total_ex_gst, SUM(i.gst_amount) as total_gst,
        SUM(i.total_value) as total_inc_gst
      FROM invoices i ${where}
      GROUP BY i.supplier_name ORDER BY total_inc_gst DESC NULLS LAST
    `, params);
    if (format === 'csv') {
      const csv = stringify(result.rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="supplier_spend_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv); return;
    }
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/reports/invoices  ← NEW: invoice line items export
router.get('/invoices', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { from, to, format } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (from) { conditions.push(`i.received_date >= $${p++}`); params.push(from); }
    if (to) { conditions.push(`i.received_date <= $${p++}`); params.push(to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`
      SELECT
        i.invoice_number, i.supplier_name, i.received_date, i.invoice_date,
        i.status, ii.item_name, ii.batch_number, ii.expiry_date,
        ii.quantity, ii.unit_cost, ii.gst_applicable, ii.gst_amount, ii.total_cost,
        i.subtotal, i.gst_amount as invoice_gst, i.total_value,
        u.name as entered_by
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      JOIN users u ON i.entered_by = u.id
      ${where}
      ORDER BY i.received_date DESC, i.invoice_number, ii.item_name
    `, params);
    if (format === 'csv') {
      const csv = stringify(result.rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="invoices_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv); return;
    }
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/reports/movements
router.get('/movements', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { item_id, from, to, type, format, page = '1', limit = '100' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (item_id) { conditions.push(`sa.inventory_item_id = $${p++}`); params.push(item_id); }
    if (from) { conditions.push(`DATE(sa.created_at) >= $${p++}`); params.push(from); }
    if (to) { conditions.push(`DATE(sa.created_at) <= $${p++}`); params.push(to); }
    if (type) { conditions.push(`sa.adjustment_type = $${p++}`); params.push(type); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`
      SELECT sa.*, i.name as item_name, i.unit, i.sku, u.name as adjusted_by_name
      FROM stock_adjustments sa
      JOIN inventory_items i ON sa.inventory_item_id = i.id
      LEFT JOIN users u ON sa.adjusted_by = u.id
      ${where} ORDER BY sa.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limitNum, offset]);
    if (format === 'csv') {
      const csv = stringify(result.rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="movements_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv); return;
    }
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/reports/wastage?from=&to=&format=csv
router.get('/wastage', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { from = new Date(Date.now() - 30*24*3600*1000).toISOString().split('T')[0], to = new Date().toISOString().split('T')[0], format } = req.query as Record<string, string>;

    const result = await query(`
      SELECT
        sa.created_at, sa.adjustment_type, sa.wastage_reason,
        sa.quantity_change, sa.reason,
        i.name as item_name, i.unit, i.internal_price,
        u.name as adjusted_by_name,
        ABS(sa.quantity_change) * COALESCE(i.internal_price, 0) as estimated_cost
      FROM stock_adjustments sa
      JOIN inventory_items i ON sa.inventory_item_id = i.id
      JOIN users u ON sa.adjusted_by = u.id
      WHERE sa.adjustment_type = 'wastage'
        AND DATE(sa.created_at) BETWEEN $1 AND $2
      ORDER BY sa.created_at DESC
    `, [from, to]);

    if (format === 'csv') {
      const csv = stringify(result.rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="wastage_${from}_${to}.csv"`);
      res.send(csv); return;
    }

    const summary = result.rows.reduce((acc: Record<string, number>, r: { wastage_reason: string; estimated_cost: string }) => {
      const key = r.wastage_reason || 'other';
      acc[key] = (acc[key] || 0) + parseFloat(r.estimated_cost || '0');
      return acc;
    }, {});

    res.json({ records: result.rows, summary, total_cost: Object.values(summary).reduce((a: number, b) => a + (b as number), 0) });
  } catch (err) { next(err); }
});

// GET /api/reports/bas  — GST / BAS summary for Australian practices
router.get('/bas', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { from, to, format } = req.query as Record<string, string>;

    const now = new Date();
    const fyStart = now.getMonth() >= 6
      ? `${now.getFullYear()}-07-01`
      : `${now.getFullYear() - 1}-07-01`;
    const fromDate = from || fyStart;
    const toDate   = to   || now.toISOString().split('T')[0];

    const purchases = await query(`
      SELECT
        SUM(CASE WHEN ii.gst_applicable THEN ii.total_cost - ii.gst_amount ELSE ii.total_cost END) AS subtotal,
        SUM(CASE WHEN ii.gst_applicable THEN ii.gst_amount ELSE 0 END) AS gst_credits,
        SUM(ii.total_cost) AS total_incl_gst,
        COUNT(DISTINCT i.id) AS invoice_count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.status = 'posted'
        AND i.posted_at BETWEEN $1 AND ($2::date + INTERVAL '1 day')
    `, [fromDate, toDate]);

    const supplies = await query(`
      SELECT
        SUM(sfi.total_charge) AS total_charge,
        SUM(CASE WHEN i.gst_applicable THEN sfi.total_charge / 1.1 ELSE sfi.total_charge END) AS excl_gst,
        SUM(CASE WHEN i.gst_applicable THEN sfi.total_charge - sfi.total_charge / 1.1 ELSE 0 END) AS gst_collected
      FROM stock_fulfillment_items sfi
      JOIN inventory_items i     ON sfi.inventory_item_id = i.id
      JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
      WHERE sf.completed_at BETWEEN $1 AND ($2::date + INTERVAL '1 day')
        AND sfi.total_charge IS NOT NULL AND sfi.total_charge > 0
    `, [fromDate, toDate]);

    const monthly = await query(`
      SELECT
        TO_CHAR(i.posted_at, 'YYYY-MM') AS month,
        SUM(ii.total_cost)  AS purchases_incl_gst,
        SUM(ii.gst_amount)  AS input_tax_credits
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.status = 'posted'
        AND i.posted_at BETWEEN $1 AND ($2::date + INTERVAL '1 day')
      GROUP BY TO_CHAR(i.posted_at, 'YYYY-MM')
      ORDER BY month
    `, [fromDate, toDate]);

    const p = purchases.rows[0];
    const s = supplies.rows[0];

    const summary = {
      period:           { from: fromDate, to: toDate },
      purchases: {
        total_incl_gst: parseFloat(p.total_incl_gst || '0'),
        subtotal:       parseFloat(p.subtotal        || '0'),
        gst_credits:    parseFloat(p.gst_credits     || '0'),
        invoice_count:  parseInt(p.invoice_count     || '0'),
      },
      supplies: {
        total_charge:   parseFloat(s.total_charge    || '0'),
        excl_gst:       parseFloat(s.excl_gst        || '0'),
        gst_collected:  parseFloat(s.gst_collected   || '0'),
      },
      net_gst_payable:  parseFloat(s.gst_collected || '0') - parseFloat(p.gst_credits || '0'),
      monthly_breakdown: monthly.rows,
    };

    if (format === 'csv') {
      const { stringify } = await import('csv-stringify/sync');
      const rows = monthly.rows.map((m: Record<string, string>) => ({
        month: m.month,
        purchases_incl_gst: parseFloat(m.purchases_incl_gst || '0').toFixed(2),
        input_tax_credits:  parseFloat(m.input_tax_credits  || '0').toFixed(2),
      }));
      rows.push({
        month: 'TOTAL',
        purchases_incl_gst: summary.purchases.total_incl_gst.toFixed(2),
        input_tax_credits:  summary.purchases.gst_credits.toFixed(2),
      });
      const csv = stringify(rows, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="BAS_${fromDate}_to_${toDate}.csv"`);
      res.send(csv);
      return;
    }

    res.json(summary);
  } catch (err) { next(err); }
});

export default router;
