import { Router, Request, Response, NextFunction } from 'express';
import { stringify } from 'csv-stringify/sync';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireAdmin);

// GET /api/audit
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      entity_type, user_id, action, from, to,
      page = '1', limit = '100', format,
    } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (entity_type) { conditions.push(`al.entity_type = $${p++}`); params.push(entity_type); }
    if (user_id) { conditions.push(`al.user_id = $${p++}`); params.push(user_id); }
    if (action) { conditions.push(`al.action ILIKE $${p++}`); params.push(`%${action}%`); }
    if (from) { conditions.push(`DATE(al.created_at) >= $${p++}`); params.push(from); }
    if (to) { conditions.push(`DATE(al.created_at) <= $${p++}`); params.push(to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await query(`SELECT COUNT(*) FROM audit_log al ${where}`, params);
    const result = await query(`
      SELECT al.id, al.action, al.entity_type, al.entity_id, al.entity_name,
             al.user_name, al.user_role, al.ip_address,
             al.old_values, al.new_values, al.created_at
      FROM audit_log al
      ${where}
      ORDER BY al.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limitNum, offset]);

    if (format === 'csv') {
      const flat = result.rows.map(r => ({
        ...r,
        old_values: r.old_values ? JSON.stringify(r.old_values) : '',
        new_values: r.new_values ? JSON.stringify(r.new_values) : '',
      }));
      const csv = stringify(flat, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit_log_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
      return;
    }

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
