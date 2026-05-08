import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate, requireAdmin } from '../middleware/auth';
import { query } from '../db';

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

export default router;
