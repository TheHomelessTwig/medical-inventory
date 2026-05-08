/**
 * Category budget management.
 * GET /api/budgets?month=YYYY-MM  - spending vs budget for a month
 * PUT /api/budgets                - upsert (admin only)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/budgets — budget vs actual spend for a given month
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const monthStr = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    // monthStr format: YYYY-MM
    const periodStart = `${monthStr}-01`;

    const result = await query(`
      SELECT
        c.id as category_id,
        c.name as category_name,
        c.color as category_color,
        COALESCE(cb.budget_amount, 0) as budget_amount,
        COALESCE(SUM(sfi.total_charge), 0) as actual_spend
      FROM categories c
      LEFT JOIN category_budgets cb
        ON cb.category_id = c.id AND cb.period_month = $1
      LEFT JOIN inventory_items i ON i.category_id = c.id AND i.is_active = true
      LEFT JOIN stock_fulfillment_items sfi ON sfi.inventory_item_id = i.id
      LEFT JOIN stock_fulfillments sf
        ON sfi.fulfillment_id = sf.id
        AND DATE_TRUNC('month', sf.completed_at) = DATE_TRUNC('month', $1::date)
      GROUP BY c.id, c.name, c.color, cb.budget_amount
      ORDER BY c.name
    `, [periodStart]);

    res.json(result.rows);
  } catch (err) { next(err); }
});

// PUT /api/budgets — upsert one budget entry (admin only)
router.put('/', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = z.object({
      category_id:   z.string().uuid(),
      period_month:  z.string().regex(/^\d{4}-\d{2}$/),
      budget_amount: z.number().min(0),
    }).parse(req.body);

    const periodStart = `${body.period_month}-01`;

    await query(`
      INSERT INTO category_budgets (category_id, period_month, budget_amount, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (category_id, period_month) DO UPDATE SET budget_amount = $3
    `, [body.category_id, periodStart, body.budget_amount, req.user!.id]);

    res.json({ message: 'Budget saved' });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

export default router;
