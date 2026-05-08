import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middleware/auth';
import { query } from '../db';
import { logAudit, getClientInfo } from '../utils/audit';

const router = Router();

interface VersionInfo {
  version: string;
  releaseDate: string;
  description: string;
}

function readVersion(): VersionInfo {
  try {
    // Look for version.json at the project root (2 levels up from dist/src/routes)
    const candidates = [
      path.resolve(__dirname, '../../../version.json'),   // from dist/routes
      path.resolve(__dirname, '../../version.json'),      // from src/routes
      path.resolve(process.cwd(), 'version.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    }
  } catch { /* ignore */ }
  return { version: 'unknown', releaseDate: '', description: 'MedInventory' };
}

// GET /api/system/version  — public (no auth needed on health-check level)
router.get('/version', async (_req: Request, res: Response): Promise<void> => {
  res.json(readVersion());
});

// GET /api/system/status  — admin only: DB stats + uptime
router.get('/status', authenticate, requireAdmin, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [dbSize, tableCount, userCount] = await Promise.all([
      query(`SELECT pg_size_pretty(pg_database_size(current_database())) as db_size`),
      query(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`),
      query(`SELECT COUNT(*) FILTER (WHERE is_active) as active, COUNT(*) as total FROM users`),
    ]);

    res.json({
      ...readVersion(),
      uptime_seconds: Math.floor(process.uptime()),
      db_size: dbSize.rows[0]?.db_size,
      table_count: tableCount.rows[0]?.count,
      users: userCount.rows[0],
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (err) { next(err); }
});

// GET /api/system/branding — public (needed on the login screen before auth)
router.get('/branding', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`SELECT practice_name, practice_tagline FROM system_config WHERE id = 1`);
    if (result.rows.length === 0) {
      res.json({ practice_name: "S.H.I.T.", practice_tagline: "Sam's Helpful Inventory Tracker" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/system/branding — admin only
router.put('/branding', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const brandingSchema = z.object({
      practice_name:    z.string().min(1).max(255),
      practice_tagline: z.string().max(255),
    });
    const body = brandingSchema.parse(req.body);

    const result = await query(`
      UPDATE system_config
      SET practice_name = $1, practice_tagline = $2, updated_at = NOW(), updated_by = $3
      WHERE id = 1
      RETURNING practice_name, practice_tagline, updated_at
    `, [body.practice_name, body.practice_tagline, req.user!.id]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'BRANDING_UPDATED',
      entityType: 'system',
      newValues: body,
      ipAddress,
      userAgent,
    });

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors[0].message }); return; }
    next(err);
  }
});

export default router;
