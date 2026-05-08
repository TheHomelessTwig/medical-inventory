/**
 * Admin settings service.
 *
 * Reads from the admin_settings table (single row, id=1).
 * Falls back to environment variables when a column is NULL so that
 * existing .env deployments keep working without touching the DB.
 *
 * Usage:
 *   const s = await getSettings();
 *   s.smtp_host  // DB value or process.env.SMTP_HOST
 *
 * Callers do NOT cache — the DB lookup is a single indexed primary-key
 * scan and is effectively free. This means settings take effect
 * immediately when changed from the admin UI.
 */

import { query } from '../db';

export interface AdminSettings {
  // Email
  smtp_host:               string | null;
  smtp_port:               number;
  smtp_secure:             boolean;
  smtp_user:               string | null;
  smtp_pass:               string | null;
  smtp_from:               string;
  app_url:                 string;
  // Security
  session_timeout_minutes: number;
  max_login_attempts:      number;
  lockout_minutes:         number;
  // Jobs
  report_timezone:         string;
  // Backup
  backup_enabled:          boolean;
  backup_schedule:         string;   // 'daily' | 'weekly'
  backup_retain_days:      number;
  backup_dir:              string;
}

const DEFAULTS: AdminSettings = {
  smtp_host:               null,
  smtp_port:               587,
  smtp_secure:             false,
  smtp_user:               null,
  smtp_pass:               null,
  smtp_from:               'noreply@clinic.local',
  app_url:                 'http://localhost:3000',
  session_timeout_minutes: 30,
  max_login_attempts:      5,
  lockout_minutes:         15,
  report_timezone:         'UTC',
  backup_enabled:          false,
  backup_schedule:         'daily',
  backup_retain_days:      30,
  backup_dir:              '/opt/medinv/backups',
};

/** Merge DB row with env-var fallbacks. */
function mergeWithEnv(row: Partial<AdminSettings>): AdminSettings {
  return {
    smtp_host:               row.smtp_host               ?? process.env.SMTP_HOST               ?? null,
    smtp_port:               row.smtp_port               ?? parseInt(process.env.SMTP_PORT ?? '587'),
    smtp_secure:             row.smtp_secure              ?? (process.env.SMTP_SECURE === 'true'),
    smtp_user:               row.smtp_user               ?? process.env.SMTP_USER               ?? null,
    smtp_pass:               row.smtp_pass               ?? process.env.SMTP_PASS               ?? null,
    smtp_from:               row.smtp_from               ?? process.env.SMTP_FROM               ?? DEFAULTS.smtp_from,
    app_url:                 row.app_url                 ?? process.env.APP_URL                 ?? DEFAULTS.app_url,
    session_timeout_minutes: row.session_timeout_minutes ?? parseInt(process.env.SESSION_TIMEOUT_MINUTES ?? '30'),
    max_login_attempts:      row.max_login_attempts      ?? parseInt(process.env.MAX_LOGIN_ATTEMPTS      ?? '5'),
    lockout_minutes:         row.lockout_minutes         ?? parseInt(process.env.LOCKOUT_MINUTES         ?? '15'),
    report_timezone:         row.report_timezone         ?? process.env.REPORT_TIMEZONE         ?? 'UTC',
    backup_enabled:          row.backup_enabled          ?? false,
    backup_schedule:         row.backup_schedule         ?? 'daily',
    backup_retain_days:      row.backup_retain_days      ?? 30,
    backup_dir:              row.backup_dir              ?? process.env.BACKUP_DIR              ?? '/opt/medinv/backups',
  };
}

export async function getSettings(): Promise<AdminSettings> {
  try {
    const result = await query('SELECT * FROM admin_settings WHERE id = 1');
    if (result.rows.length === 0) return mergeWithEnv({});
    return mergeWithEnv(result.rows[0]);
  } catch {
    // DB not ready yet (e.g. during migration) — use env-only defaults
    return mergeWithEnv({});
  }
}

export async function saveSettings(
  updates: Partial<Omit<AdminSettings, 'smtp_pass'> & { smtp_pass?: string | null }>,
  updatedBy: string
): Promise<AdminSettings> {
  const fields = Object.entries(updates)
    .map(([k], i) => `${k} = $${i + 1}`)
    .join(', ');
  const values = Object.values(updates);
  const p = values.length + 1;

  await query(
    `UPDATE admin_settings SET ${fields}, updated_at = NOW(), updated_by = $${p} WHERE id = 1`,
    [...values, updatedBy]
  );
  return getSettings();
}
