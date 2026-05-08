import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      'SELECT * FROM suppliers WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, contact_name, email, phone, address, notes } = req.body;
    if (!name) { res.status(400).json({ error: 'Name required' }); return; }
    const result = await query(
      'INSERT INTO suppliers (name, contact_name, email, phone, address, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, contact_name, email, phone, address, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, contact_name, email, phone, address, notes, is_active } = req.body;
    const result = await query(`
      UPDATE suppliers SET
        name=COALESCE($1,name), contact_name=COALESCE($2,contact_name),
        email=COALESCE($3,email), phone=COALESCE($4,phone),
        address=COALESCE($5,address), notes=COALESCE($6,notes),
        is_active=COALESCE($7,is_active)
      WHERE id=$8 RETURNING *
    `, [name, contact_name, email, phone, address, notes, is_active, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

export default router;
