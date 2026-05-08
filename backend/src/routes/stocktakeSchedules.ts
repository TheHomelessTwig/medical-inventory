/**
 * Stocktake schedule CRUD.
 *
 * GET    /api/stocktake-schedules        — list
 * POST   /api/stocktake-schedules        — create
 * PUT    /api/stocktake-schedules/:id    — update
 * DELETE /api/stocktake-schedules/:id    — delete
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { authenticate, requireAdminOrManager } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireAdminOrManager);

function computeNextDue(frequency: string, dayOfPeriod: number): Date {
  const now = new Date();
  const d = new Date(now);

  if (frequency === 'weekly') {
    // dayOfPeriod: 1=Monday … 7=Sunday
    const currentDay = d.getDay() || 7;  // 0=Sun → 7
    const daysUntil = ((dayOfPeriod - currentDay) + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntil);
  } else if (frequency === 'monthly' || frequency === 'quarterly') {
    // dayOfPeriod: day of month (1-28)
    d.setDate(dayOfPeriod);
    if (d <= now) {
      if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
      else                         d.setMonth(d.getMonth() + 3);
    }
  }
  d.setHours(7, 0, 0, 0);
  return d;
}

const schedSchema = z.object({
  name:              z.string().min(1).max(255),
  frequency:         z.enum(['weekly','monthly','quarterly']),
  day_of_period:     z.number().int().min(1).max(28).default(1),
  stocktake_type:    z.enum(['full','partial']).default('full'),
  scope_category_id: z.string().uuid().optional().nullable(),
  scope_location:    z.string().optional().nullable(),
  notify_emails:     z.array(z.string().email()).optional().default([]),
  is_active:         z.boolean().default(true),
});

router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT s.*, c.name AS category_name, u.name AS created_by_name
      FROM stocktake_schedules s
      LEFT JOIN categories c ON s.scope_category_id = c.id
      JOIN users u ON s.created_by = u.id
      ORDER BY s.name
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = schedSchema.parse(req.body);
    const nextDue = computeNextDue(body.frequency, body.day_of_period);

    const result = await query(`
      INSERT INTO stocktake_schedules
        (name, frequency, day_of_period, stocktake_type, scope_category_id,
         scope_location, notify_emails, is_active, next_due_at, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [body.name, body.frequency, body.day_of_period, body.stocktake_type,
        body.scope_category_id, body.scope_location, body.notify_emails,
        body.is_active, nextDue.toISOString(), req.user!.id]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors[0].message }); return; }
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = schedSchema.partial().parse(req.body);
    const existing = await query('SELECT * FROM stocktake_schedules WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ error: 'Schedule not found' }); return; }
    const cur = existing.rows[0];

    const freq     = body.frequency    ?? cur.frequency;
    const dayOfP   = body.day_of_period ?? cur.day_of_period;
    const nextDue  = computeNextDue(freq, dayOfP);

    const result = await query(`
      UPDATE stocktake_schedules SET
        name = COALESCE($1, name), frequency = COALESCE($2, frequency),
        day_of_period = COALESCE($3, day_of_period),
        stocktake_type = COALESCE($4, stocktake_type),
        scope_category_id = $5, scope_location = $6,
        notify_emails = COALESCE($7, notify_emails),
        is_active = COALESCE($8, is_active), next_due_at = $9
      WHERE id = $10 RETURNING *
    `, [body.name, body.frequency, body.day_of_period, body.stocktake_type,
        body.scope_category_id ?? cur.scope_category_id,
        body.scope_location ?? cur.scope_location,
        body.notify_emails, body.is_active, nextDue.toISOString(), req.params.id]);

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors[0].message }); return; }
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`DELETE FROM stocktake_schedules WHERE id=$1 RETURNING name`, [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Schedule not found' }); return; }
    res.json({ message: 'Schedule deleted' });
  } catch (err) { next(err); }
});

export default router;
