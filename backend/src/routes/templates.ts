/**
 * Requisition templates — doctors save named order templates.
 * GET  /api/templates           - list own templates
 * POST /api/templates           - create
 * PUT  /api/templates/:id       - update
 * DELETE /api/templates/:id     - delete
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(requireRole('doctor', 'admin'));

const templateSchema = z.object({
  name: z.string().min(1).max(255),
  items: z.array(z.object({
    inventory_item_id: z.string().uuid(),
    item_name: z.string(),
    quantity_requested: z.number().positive(),
    unit: z.string(),
  })).min(1),
});

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT * FROM request_templates WHERE doctor_id = $1 ORDER BY name`,
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = templateSchema.parse(req.body);
    const result = await query(
      `INSERT INTO request_templates (name, doctor_id, items)
       VALUES ($1, $2, $3) RETURNING *`,
      [body.name, req.user!.id, JSON.stringify(body.items)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = templateSchema.partial().parse(req.body);
    const result = await query(
      `UPDATE request_templates SET
         name  = COALESCE($1, name),
         items = COALESCE($2, items)
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
