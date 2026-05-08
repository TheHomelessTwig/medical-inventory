/**
 * Order / charge templates — any logged-in user can save named baskets.
 * Doctors use these in the New Order screen.
 * Nurses use these in the Quick Charge screen.
 * Each user sees only their own templates; stored in the doctor_id column
 * (which is a plain users FK, role-agnostic).
 *
 * GET    /api/templates        - list caller's own templates
 * POST   /api/templates        - create
 * PUT    /api/templates/:id    - update (own only)
 * DELETE /api/templates/:id    - delete (own only)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate); // any logged-in role

const itemSchema = z.object({
  inventory_item_id: z.string().uuid(),
  item_name: z.string(),
  quantity_requested: z.number().positive(),
  unit: z.string(),
});

const templateSchema = z.object({
  name: z.string().min(1).max(255),
  items: z.array(itemSchema).min(1),
});

// GET /api/templates — return caller's own templates
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT * FROM request_templates WHERE doctor_id = $1 ORDER BY name`,
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/templates — create a new template
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = templateSchema.parse(req.body);
    const result = await query(
      `INSERT INTO request_templates (name, doctor_id, items)
       VALUES ($1, $2, $3)
       ON CONFLICT (doctor_id, name)
       DO UPDATE SET items = EXCLUDED.items, updated_at = NOW()
       RETURNING *`,
      [body.name, req.user!.id, JSON.stringify(body.items)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

// PUT /api/templates/:id — update own template
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = templateSchema.partial().parse(req.body);
    const result = await query(
      `UPDATE request_templates
       SET name  = COALESCE($1, name),
           items = COALESCE($2, items),
           updated_at = NOW()
       WHERE id = $3 AND doctor_id = $4
       RETURNING *`,
      [body.name ?? null, body.items ? JSON.stringify(body.items) : null, req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

// DELETE /api/templates/:id — delete own template
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `DELETE FROM request_templates WHERE id = $1 AND doctor_id = $2 RETURNING id`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json({ message: 'Template deleted' });
  } catch (err) { next(err); }
});

export default router;
