/**
 * Built-in database backup job.
 *
 * Runs on the schedule configured in admin_settings (daily or weekly).
 * Creates a gzipped pg_dump in the configured backup_dir.
 * Prunes backups older than backup_retain_days.
 *
 * Works inside Docker by shelling out to pg_dump directly
 * (the backend container shares the Docker network with the postgres container).
 */

import cron    from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getSettings } from '../services/settings';
import { sendMail } from '../utils/email';
import { query } from '../db';

const execAsync = promisify(exec);

function pad(n: number) { return String(n).padStart(2, '0'); }

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function runBackup(): Promise<{ file: string; size_bytes: number }> {
  const s = await getSettings();
  const dir = s.backup_dir || '/opt/medinv/backups';

  // Ensure backup directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dbHost = process.env.DB_HOST || 'postgres';
  const dbUser = process.env.DB_USER || 'medinv';
  const dbName = process.env.DB_NAME || 'medical_inventory';
  const dbPass = process.env.DB_PASSWORD || '';
  const file   = path.join(dir, `backup_${timestamp()}.sql.gz`);

  const cmd = `PGPASSWORD="${dbPass}" pg_dump -h ${dbHost} -U ${dbUser} ${dbName} | gzip > "${file}"`;
  await execAsync(cmd);

  const stat = fs.statSync(file);

  // Prune old backups
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - s.backup_retain_days);
  const pruned: string[] = [];

  for (const f of fs.readdirSync(dir)) {
    if (!f.match(/^backup_.*\.sql\.gz$/)) continue;
    const fp = path.join(dir, f);
    if (fs.statSync(fp).mtime < cutoff) {
      try { fs.unlinkSync(fp); pruned.push(f); } catch { /* ignore */ }
    }
  }

  console.log(`[backup] Created ${path.basename(file)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)${pruned.length ? `; pruned ${pruned.length} old backup(s)` : ''}`);

  // Email admins on failure notification is handled by caller;
  // on success we just return so the caller can decide whether to notify.
  return { file: path.basename(file), size_bytes: stat.size };
}

let _backupCron: ReturnType<typeof cron.schedule> | null = null;

export async function startBackupJob(): Promise<void> {
  const s = await getSettings();
  if (!s.backup_enabled) {
    console.log('[backup] Built-in backup is disabled — configure in Admin Settings');
    return;
  }

  const timezone = s.report_timezone || 'UTC';

  // daily = 02:00 every day; weekly = 02:00 every Sunday
  const schedule = s.backup_schedule === 'weekly' ? '0 2 * * 0' : '0 2 * * *';

  if (_backupCron) { _backupCron.stop(); }

  _backupCron = cron.schedule(schedule, async () => {
    console.log('[backup] Running scheduled backup…');
    try {
      const result = await runBackup();
      const admins = await query(`SELECT email FROM users WHERE role IN ('admin','practice_manager') AND is_active=true`);
      const emails = admins.rows.map((r: { email: string }) => r.email);
      if (emails.length > 0) {
        await sendMail(emails, 'S.H.I.T. — ✅ Scheduled backup complete', `
          <h2>Backup Successful</h2>
          <ul>
            <li>File: <code>${result.file}</code></li>
            <li>Size: ${(result.size_bytes / 1024 / 1024).toFixed(2)} MB</li>
            <li>Directory: ${(await getSettings()).backup_dir}</li>
          </ul>
        `);
      }
    } catch (err) {
      console.error('[backup] Scheduled backup failed:', err);
      const admins = await query(`SELECT email FROM users WHERE role IN ('admin','practice_manager') AND is_active=true`);
      const emails = admins.rows.map((r: { email: string }) => r.email);
      if (emails.length > 0) {
        await sendMail(emails, '⚠️ S.H.I.T. — Scheduled backup FAILED', `
          <h2>⚠️ Backup Failed</h2>
          <p>The scheduled database backup failed with the following error:</p>
          <pre style="background:#f1f5f9;padding:12px;border-radius:8px;font-size:12px">${String(err)}</pre>
          <p>Please check the server logs and disk space.</p>
        `);
      }
    }
  }, { timezone });

  const label = s.backup_schedule === 'weekly' ? 'Sundays' : 'daily';
  console.log(`[backup] Scheduled backup enabled (${label} at 02:00 ${timezone})`);
}
