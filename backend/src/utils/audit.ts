import { PoolClient } from 'pg';
import { query } from '../db';
import { AuthUser } from '../middleware/auth';
import { Request } from 'express';

interface AuditEntry {
  user?: AuthUser;
  action: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export const logAudit = async (
  entry: AuditEntry,
  client?: PoolClient
): Promise<void> => {
  const sql = `
    INSERT INTO audit_log
      (user_id, user_name, user_role, action, entity_type, entity_id, entity_name, old_values, new_values, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `;
  const params = [
    entry.user?.id ?? null,
    entry.user?.name ?? 'System',
    entry.user?.role ?? null,
    entry.action,
    entry.entityType ?? null,
    entry.entityId ?? null,
    entry.entityName ?? null,
    entry.oldValues ? JSON.stringify(entry.oldValues) : null,
    entry.newValues ? JSON.stringify(entry.newValues) : null,
    entry.ipAddress ?? null,
    entry.userAgent ?? null,
  ];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
};

export const getClientInfo = (req: Request): { ipAddress: string; userAgent: string } => ({
  ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '',
  userAgent: req.headers['user-agent'] || '',
});
