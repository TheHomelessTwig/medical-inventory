/**
 * Multi-site management.
 *
 * GET    /api/sites         — list all sites
 * POST   /api/sites         — create site (admin)
 * PUT    /api/sites/:id     — update site (admin)
 * DELETE /api/sites/:id     — deactivate site (admin)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';

const router = Router();
router.use(authenticate);

const siteSchema = z.object({
  name:    z.string().min(1).max(255),
  address: z.string().optional().nullable(),
  phone:   z.string().max(50).optional().nullable(),
  email:   z.string().email().optional().nullable(),
});

// GET /api/sites
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM users WHERE site_id = s.id) AS user_count,
        (SELECT COUNT(*) FROM inventory_items WHERE site_id = s.id) AS item_count
      FROM sites s
      ORDER BY s.name
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/sites
router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = siteSchema.parse(req.body);
    const result = await query(`
      INSERT INTO sites (name, address, phone, email)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [body.name, body.address, body.phone, body.email]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'SITE_CREATED', entityType: 'site', entityId: result.rows[0].id, entityName: body.name, ipAddress, userAgent });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors[0].message }); return; }
    next(err);
  }
});

// PUT /api/sites/:id
router.put('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = siteSchema.partial().parse(req.body);
    const result = await query(`
      UPDATE sites SET
        name    = COALESCE($1, name),
        address = COALESCE($2, address),
        phone   = COALESCE($3, phone),
        email   = COALESCE($4, email),
        is_active = COALESCE($5, is_active)
      WHERE id = $6
      RETURNING *
    `, [body.name, body.address, body.phone, body.email,
        (req.body as Record<string, unknown>).is_active ?? null, req.params.id]);

    if (result.rows.length === 0) { res.status(404).json({ error: 'Site not found' }); return; }

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'SITE_UPDATED', entityType: 'site', entityId: req.params.id, entityName: result.rows[0].name, ipAddress, userAgent });
    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors[0].message }); return; }
    next(err);
  }
});

// DELETE /api/sites/:id (deactivate)
router.delete('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Prevent deleting the default site
    if (req.params.id === '00000000-0000-0000-0000-000000000001') {
      res.status(400).json({ error: 'Cannot delete the default site' }); return;
    }
    const result = await query(
      `UPDATE sites SET is_active = false WHERE id = $1 RETURNING name`,
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Site not found' }); return; }
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'SITE_DEACTIVATED', entityType: 'site', entityId: req.params.id, entityName: result.rows[0].name, ipAddress, userAgent });
    res.json({ message: 'Site deactivated' });
  } catch (err) { next(err); }
});

export default router;
