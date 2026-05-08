/**
 * Data retention and privacy compliance.
 *
 * GET  /api/retention/config           — get current retention settings
 * PUT  /api/retention/config           — update settings (admin)
 * POST /api/retention/run              — trigger retention job manually (admin)
 * GET  /api/retention/db-size          — table size report
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { runRetentionJob } from '../jobs/retentionJob';

const router = Router();
router.use(authenticate, requireAdmin);

const configSchema = z.object({
  audit_log_retain_days:    z.number().int().min(30).max(36500),
  patient_data_retain_days: z.number().int().min(30).max(36500),
  anonymise_patient_refs:   z.boolean(),
});

// GET /api/retention/config
router.get('/config', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query('SELECT * FROM data_retention_config WHERE id = 1');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/retention/config
router.put('/config', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = configSchema.parse(req.body);
    const result = await query(`
      UPDATE data_retention_config SET
        audit_log_retain_days    = $1,
        patient_data_retain_days = $2,
        anonymise_patient_refs   = $3,
        updated_by = $4,
        updated_at = NOW()
      WHERE id = 1
      RETURNING *
    `, [body.audit_log_retain_days, body.patient_data_retain_days, body.anonymise_patient_refs, req.user!.id]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'RETENTION_CONFIG_UPDATED', entityType: 'system', newValues: body, ipAddress, userAgent });
    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors[0].message }); return; }
    next(err);
  }
});

// POST /api/retention/run — manual trigger
router.post('/run', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const summary = await runRetentionJob();
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'RETENTION_JOB_RUN', entityType: 'system', newValues: summary as unknown as Record<string, unknown>, ipAddress, userAgent });
    res.json({ message: 'Retention job completed', ...summary });
  } catch (err) { next(err); }
});

// GET /api/retention/db-size — table size report
router.get('/db-size', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tables = await query(`
      SELECT
        relname                                      AS table_name,
        pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
        pg_total_relation_size(relid)                AS total_bytes,
        pg_size_pretty(pg_relation_size(relid))      AS table_size,
        pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
        reltuples::bigint                            AS row_estimate
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
    `);

    const dbSize = await query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS total_db_size,
             pg_database_size(current_database()) AS total_bytes
    `);

    const auditCount = await query(`SELECT COUNT(*) FROM audit_log`);
    const archiveCount = await query(`SELECT COUNT(*) FROM audit_log_archive`);

    res.json({
      database: dbSize.rows[0],
      tables: tables.rows,
      audit_log: {
        live_rows: parseInt(auditCount.rows[0].count),
        archive_rows: parseInt(archiveCount.rows[0].count),
      },
    });
  } catch (err) { next(err); }
});

export default router;
