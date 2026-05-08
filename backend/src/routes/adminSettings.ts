/**
 * Admin settings — GET / PUT / test-email / test-backup / run-backup-now
 *
 * GET  /api/admin-settings          — read current settings (password redacted)
 * PUT  /api/admin-settings          — update one or more settings
 * POST /api/admin-settings/test-email  — send test email to the requesting admin
 * POST /api/admin-settings/backup-now  — run a manual backup immediately
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { testEmail } from '../utils/email';
import { getSettings, saveSettings } from '../services/settings';
import { runBackup, startBackupJob } from '../jobs/backupJob';

const router = Router();
router.use(authenticate, requireAdmin);

const settingsSchema = z.object({
  // Email
  smtp_host:               z.string().nullable().optional(),
  smtp_port:               z.number().int().min(1).max(65535).optional(),
  smtp_secure:             z.boolean().optional(),
  smtp_user:               z.string().nullable().optional(),
  smtp_pass:               z.string().nullable().optional(),
  smtp_from:               z.string().optional(),
  app_url:                 z.string().url().optional(),
  // Security
  session_timeout_minutes: z.number().int().min(5).max(480).optional(),
  max_login_attempts:      z.number().int().min(1).max(20).optional(),
  lockout_minutes:         z.number().int().min(1).max(60).optional(),
  // Jobs
  report_timezone:         z.string().min(1).optional(),
  // Backup
  backup_enabled:          z.boolean().optional(),
  backup_schedule:         z.enum(['daily','weekly']).optional(),
  backup_retain_days:      z.number().int().min(1).max(3650).optional(),
  backup_dir:              z.string().optional(),
});

// GET /api/admin-settings
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const s = await getSettings();
    // Never return the SMTP password — redact it
    res.json({
      ...s,
      smtp_pass: s.smtp_pass ? '••••••••' : null,
    });
  } catch (err) { next(err); }
});

// PUT /api/admin-settings
router.put('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = settingsSchema.parse(req.body);

    // If smtp_pass is the redacted placeholder, don't overwrite
    if (body.smtp_pass === '••••••••') {
      delete body.smtp_pass;
    }

    const updated = await saveSettings(body, req.user!.id);

    const { ipAddress, userAgent } = getClientInfo(req);
    const safeLog = { ...body, smtp_pass: body.smtp_pass ? '[updated]' : undefined };
    await logAudit({
      user: req.user,
      action: 'ADMIN_SETTINGS_UPDATED',
      entityType: 'system',
      newValues: safeLog as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    // If backup settings changed, restart the backup cron with new settings
    if ('backup_enabled' in body || 'backup_schedule' in body || 'report_timezone' in body) {
      startBackupJob().catch(err => console.error('[backup] Failed to restart job after settings update:', err));
    }

    res.json({ ...updated, smtp_pass: updated.smtp_pass ? '••••••••' : null });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors[0].message }); return; }
    next(err);
  }
});

// POST /api/admin-settings/test-email
router.post('/test-email', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { to } = req.body as { to?: string };
    const recipient = to || req.user!.email;
    const result = await testEmail(recipient);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/admin-settings/backup-now
router.post('/backup-now', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await runBackup();
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'BACKUP_MANUAL',
      entityType: 'system',
      newValues: { file: result.file, size_bytes: result.size_bytes } as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
    });
    res.json({ message: 'Backup completed', ...result });
  } catch (err) {
    res.status(500).json({ error: `Backup failed: ${String(err)}` });
  }
});

// GET /api/admin-settings/backups — list existing backup files
router.get('/backups', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const s = await getSettings();
    const dir = s.backup_dir || '/opt/medinv/backups';
    const fs = await import('fs');
    const path = await import('path');

    if (!fs.existsSync(dir)) { res.json([]); return; }

    const files = fs.readdirSync(dir)
      .filter(f => f.match(/\.(sql\.gz|gz)$/))
      .map(f => {
        const stat = fs.statSync(path.join(dir, f));
        return { name: f, size_bytes: stat.size, created_at: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50);

    res.json(files);
  } catch (err) { next(err); }
});

export default router;
