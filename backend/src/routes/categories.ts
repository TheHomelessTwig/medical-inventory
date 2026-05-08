import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT c.*, COUNT(i.id) as item_count
      FROM categories c
      LEFT JOIN inventory_items i ON i.category_id = c.id AND i.is_active = true
      GROUP BY c.id ORDER BY c.name
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, color } = req.body;
    if (!name) { res.status(400).json({ error: 'Name required' }); return; }
    const result = await query(
      'INSERT INTO categories (name, description, color) VALUES ($1,$2,$3) RETURNING *',
      [name, description, color || '#6366f1']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, color } = req.body;
    const result = await query(
      'UPDATE categories SET name=COALESCE($1,name), description=COALESCE($2,description), color=COALESCE($3,color) WHERE id=$4 RETURNING *',
      [name, description, color, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

export default router;
