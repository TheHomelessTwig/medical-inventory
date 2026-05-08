import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';

const router = Router();
router.use(authenticate, requireAdmin);

const ROLES = ['admin', 'doctor', 'nurse', 'practice_manager', 'receptionist', 'locum_doctor'] as const;

const createSchema = z.object({
  email:           z.string().email().max(255),
  name:            z.string().min(1).max(255),
  role:            z.enum(ROLES),
  password:        z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain uppercase, lowercase, and a number'
  ),
  site_id:         z.string().uuid().optional().nullable(),
  locum_expires_at: z.string().datetime().optional().nullable(),
});

const updateSchema = z.object({
  name:             z.string().min(1).max(255).optional(),
  role:             z.enum(ROLES).optional(),
  is_active:        z.boolean().optional(),
  must_change_password: z.boolean().optional(),
  site_id:          z.string().uuid().optional().nullable(),
  locum_expires_at: z.string().datetime().optional().nullable(),
});

// GET /api/users
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT id, email, name, role, is_active, last_login, must_change_password,
             failed_login_attempts, locked_until, created_at
      FROM users
      ORDER BY name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = createSchema.parse(req.body);

    const existing = await query('SELECT id FROM users WHERE email = $1', [body.email.toLowerCase()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    const hash = await bcrypt.hash(body.password, 12);
    const result = await query(`
      INSERT INTO users (email, name, password_hash, role, must_change_password, site_id, locum_expires_at)
      VALUES ($1,$2,$3,$4,true,$5,$6)
      RETURNING id, email, name, role, is_active, must_change_password, site_id, locum_expires_at, created_at
    `, [body.email.toLowerCase(), body.name, hash, body.role,
        body.site_id ?? null, body.locum_expires_at ?? null]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: result.rows[0].id,
      entityName: body.email,
      newValues: { name: body.name, role: body.role },
      ipAddress,
      userAgent,
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = updateSchema.parse(req.body);

    const existing = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Prevent deactivating yourself
    if (req.params.id === req.user!.id && body.is_active === false) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }

    const result = await query(`
      UPDATE users SET
        name = COALESCE($1, name),
        role = COALESCE($2, role),
        is_active = COALESCE($3, is_active),
        must_change_password = COALESCE($4, must_change_password),
        site_id = COALESCE($5, site_id),
        locum_expires_at = $6,
        failed_login_attempts = CASE WHEN $3 = true THEN 0 ELSE failed_login_attempts END,
        locked_until = CASE WHEN $3 = true THEN NULL ELSE locked_until END
      WHERE id = $7
      RETURNING id, email, name, role, is_active, must_change_password, site_id, locum_expires_at, last_login, created_at
    `, [body.name, body.role, body.is_active, body.must_change_password,
        body.site_id ?? null, body.locum_expires_at ?? null, req.params.id]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: req.params.id,
      entityName: result.rows[0].email,
      oldValues: { name: existing.rows[0].name, role: existing.rows[0].role, is_active: existing.rows[0].is_active },
      newValues: body,
      ipAddress,
      userAgent,
    });

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      `UPDATE users SET password_hash = $1, must_change_password = true,
                        failed_login_attempts = 0, locked_until = NULL
       WHERE id = $2
       RETURNING email, name`,
      [hash, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Invalidate all refresh tokens
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.params.id]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'USER_PASSWORD_RESET',
      entityType: 'user',
      entityId: req.params.id,
      entityName: result.rows[0].email,
      ipAddress,
      userAgent,
    });

    res.json({ message: 'Password reset. User must change on next login.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id (deactivate)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }

    const result = await query(
      `UPDATE users SET is_active = false WHERE id = $1 RETURNING email, name`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'USER_DEACTIVATED',
      entityType: 'user',
      entityId: req.params.id,
      entityName: result.rows[0].email,
      ipAddress,
      userAgent,
    });

    res.json({ message: 'User deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
