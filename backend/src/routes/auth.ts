import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { TOTP } from 'otplib';

const _totp = new TOTP();
const authenticator = {
  generateSecret: () => _totp.generateSecret(),
  keyuri: (email: string, issuer: string, secret: string) =>
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,
  verify: ({ token, secret }: { token: string; secret: string }) => {
    try { return (_totp as unknown as { verify(o: { token: string; secret: string }): boolean }).verify({ token, secret }); } catch { return false; }
  },
};
import qrcode from 'qrcode';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { emailAccountLocked, emailAfterHoursLogin } from '../utils/email';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain uppercase, lowercase, and a number'
  ),
});

const generateTokens = (userId: string, email: string, name: string, role: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessToken = jwt.sign(
    { sub: userId, email, name, role, type: 'access' },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any }
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || 'refresh_secret',
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any }
  );
  return { accessToken, refreshToken };
};

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = loginSchema.parse(req.body);
    const { ipAddress, userAgent } = getClientInfo(req);

    const result = await query(
      `SELECT id, email, name, password_hash, role, is_active, failed_login_attempts,
              locked_until, must_change_password
       FROM users WHERE email = $1`,
      [body.email.toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
      await logAudit({ action: 'LOGIN_FAILED', entityName: body.email, ipAddress, userAgent });
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Check account lock
    const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5');
    const lockoutMinutes = parseInt(process.env.LOCKOUT_MINUTES || '15');

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000
      );
      res.status(423).json({ error: `Account locked. Try again in ${remaining} minutes.` });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ error: 'Account is disabled' });
      return;
    }

    const passwordValid = await bcrypt.compare(body.password, user.password_hash);

    if (!passwordValid) {
      const attempts = user.failed_login_attempts + 1;
      const lockedUntil = attempts >= maxAttempts
        ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
        : null;

      await query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
        [attempts, lockedUntil, user.id]
      );

      await logAudit({
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        entityName: user.email,
        ipAddress,
        userAgent,
      });

      const remaining = maxAttempts - attempts;
      if (remaining <= 0) {
        // Email admins about lockout
        const admins = await query(`SELECT email FROM users WHERE role='admin' AND is_active=true`);
        emailAccountLocked({ adminEmails: admins.rows.map((r: { email: string }) => r.email), lockedEmail: user.email, ipAddress });
        res.status(423).json({ error: `Account locked for ${lockoutMinutes} minutes due to too many failed attempts` });
      } else {
        res.status(401).json({ error: `Invalid email or password. ${remaining} attempt(s) remaining.` });
      }
      return;
    }

    // Reset failed attempts
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`,
      [user.id]
    );

    // After-hours alert (before 7am or after 8pm local server time)
    const hour = new Date().getHours();
    if (hour < 7 || hour >= 20) {
      const admins = await query(`SELECT email FROM users WHERE role='admin' AND is_active=true AND id != $1`, [user.id]);
      emailAfterHoursLogin({
        adminEmails: admins.rows.map((r: { email: string }) => r.email),
        userName: user.name,
        role: user.role,
        ipAddress,
        time: new Date().toLocaleString(),
      });
    }

    // If 2FA is enabled, issue a short-lived totp_pending token instead of full auth
    const fullUser = await query(`SELECT totp_enabled FROM users WHERE id=$1`, [user.id]);
    if (fullUser.rows[0]?.totp_enabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totpSession = jwt.sign(
        { sub: user.id, type: 'totp_pending' },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '2m' } as any
      );
      res.json({ requires_totp: true, totp_session: totpSession });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.name, user.role);

    // Store refresh token hash
    const tokenHash = await bcrypt.hash(refreshToken, 8);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    await logAudit({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      entityName: user.email,
      ipAddress,
      userAgent,
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.must_change_password,
        totp_enabled: false,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: err.errors });
      return;
    }
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }

    const payload = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'refresh_secret'
    ) as { sub: string; type: string };

    if (payload.type !== 'refresh') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }

    // Find matching stored tokens
    const tokens = await query(
      `SELECT rt.id, rt.token_hash, u.id as user_id, u.email, u.name, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.user_id = $1 AND rt.expires_at > NOW()`,
      [payload.sub]
    );

    let matched = false;
    let tokenRow = null;
    for (const row of tokens.rows) {
      const valid = await bcrypt.compare(refreshToken, row.token_hash);
      if (valid) {
        matched = true;
        tokenRow = row;
        break;
      }
    }

    if (!matched || !tokenRow || !tokenRow.is_active) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    // Rotate: delete old, issue new
    await query('DELETE FROM refresh_tokens WHERE id = $1', [tokenRow.id]);

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      tokenRow.user_id, tokenRow.email, tokenRow.name, tokenRow.role
    );

    const newHash = await bcrypt.hash(newRefreshToken, 8);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [tokenRow.user_id, newHash, expiresAt]
    );

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken && req.user) {
      const tokens = await query(
        'SELECT id, token_hash FROM refresh_tokens WHERE user_id = $1',
        [req.user.id]
      );
      for (const row of tokens.rows) {
        const valid = await bcrypt.compare(refreshToken, row.token_hash);
        if (valid) {
          await query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
          break;
        }
      }
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'LOGOUT',
      entityType: 'user',
      entityId: req.user?.id,
      ipAddress,
      userAgent,
    });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  const result = await query(
    `SELECT id, email, name, role, is_active, last_login, must_change_password, created_at
     FROM users WHERE id = $1`,
    [req.user!.id]
  );
  res.json(result.rows[0]);
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = changePasswordSchema.parse(req.body);
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    const valid = await bcrypt.compare(body.currentPassword, result.rows[0].password_hash);
    if (!valid) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }
    const newHash = await bcrypt.hash(body.newPassword, 12);
    await query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [newHash, req.user!.id]
    );
    // Revoke all refresh tokens
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user!.id]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: req.user!.id,
      ipAddress,
      userAgent,
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// POST /api/auth/totp/complete — step 2 of login when 2FA is enabled
router.post('/totp/complete', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { totp_session, code } = req.body;
    if (!totp_session || !code) { res.status(400).json({ error: 'totp_session and code are required' }); return; }

    let payload: { sub: string; type: string };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload = jwt.verify(totp_session, process.env.JWT_SECRET || 'secret') as any;
    } catch {
      res.status(401).json({ error: 'TOTP session expired — please log in again' }); return;
    }
    if (payload.type !== 'totp_pending') { res.status(401).json({ error: 'Invalid session' }); return; }

    const userResult = await query(`SELECT id, email, name, role, totp_secret, must_change_password FROM users WHERE id=$1`, [payload.sub]);
    const user = userResult.rows[0];
    if (!user?.totp_secret) { res.status(401).json({ error: 'TOTP not configured' }); return; }

    if (!authenticator.verify({ token: code, secret: user.totp_secret })) {
      res.status(401).json({ error: 'Invalid authenticator code' }); return;
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.name, user.role);
    const tokenHash = await bcrypt.hash(refreshToken, 8);
    await query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
      [user.id, tokenHash, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]);

    res.json({ accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.must_change_password, totp_enabled: true } });
  } catch (err) { next(err); }
});

// GET /api/auth/totp/setup — generate TOTP secret + QR code URI
router.get('/totp/setup', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(req.user!.email, "S.H.I.T.", secret);
    const qrDataUrl = await qrcode.toDataURL(otpauth);
    // Store secret (unconfirmed until /totp/verify is called)
    await query(`UPDATE users SET totp_secret=$1, totp_enabled=false WHERE id=$2`, [secret, req.user!.id]);
    res.json({ secret, qr_data_url: qrDataUrl, otpauth_url: otpauth });
  } catch (err) { next(err); }
});

// POST /api/auth/totp/verify — confirm the code to enable 2FA
router.post('/totp/verify', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code } = req.body;
    const userResult = await query(`SELECT totp_secret FROM users WHERE id=$1`, [req.user!.id]);
    const secret = userResult.rows[0]?.totp_secret;
    if (!secret) { res.status(400).json({ error: 'Run /totp/setup first' }); return; }
    if (!authenticator.verify({ token: code, secret })) { res.status(400).json({ error: 'Invalid code — check your authenticator app' }); return; }
    await query(`UPDATE users SET totp_enabled=true WHERE id=$1`, [req.user!.id]);
    res.json({ message: '2FA enabled successfully' });
  } catch (err) { next(err); }
});

// DELETE /api/auth/totp/disable — turn off 2FA
router.delete('/totp/disable', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code } = req.body;
    const userResult = await query(`SELECT totp_secret, totp_enabled FROM users WHERE id=$1`, [req.user!.id]);
    if (!userResult.rows[0]?.totp_enabled) { res.status(400).json({ error: '2FA is not enabled' }); return; }
    if (!authenticator.verify({ token: code, secret: userResult.rows[0].totp_secret })) {
      res.status(401).json({ error: 'Invalid code' }); return;
    }
    await query(`UPDATE users SET totp_secret=NULL, totp_enabled=false WHERE id=$1`, [req.user!.id]);
    res.json({ message: '2FA disabled' });
  } catch (err) { next(err); }
});

// PUT /api/auth/profile — update own name / email
router.put('/profile', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const profileSchema = z.object({
      name:  z.string().min(1).max(255).optional(),
      email: z.string().email().max(255).optional(),
    });
    const body = profileSchema.parse(req.body);

    if (!body.name && !body.email) {
      res.status(400).json({ error: 'Provide at least one field to update' });
      return;
    }

    // Check email uniqueness if changing
    if (body.email && body.email !== req.user!.email) {
      const exists = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [body.email, req.user!.id]);
      if (exists.rows.length > 0) {
        res.status(409).json({ error: 'Email is already in use' });
        return;
      }
    }

    const result = await query(
      `UPDATE users
       SET name  = COALESCE($1, name),
           email = COALESCE($2, email)
       WHERE id = $3
       RETURNING id, email, name, role, is_active, last_login, must_change_password, created_at`,
      [body.name ?? null, body.email ?? null, req.user!.id]
    );

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'PROFILE_UPDATED',
      entityType: 'user',
      entityId: req.user!.id,
      entityName: result.rows[0].name,
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

export default router;
