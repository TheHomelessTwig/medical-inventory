/**
 * Scheduled jobs:
 *  - Weekly usage + low-stock report  (Monday 08:00)
 *  - Daily expiry alert email         (08:00 every day)
 *  - Weekly backup integrity check    (Sunday 04:00)
 */

import cron    from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { query } from '../db';
import { emailWeeklyReport, sendMail } from '../utils/email';
import { getSettings } from '../services/settings';

const execAsync = promisify(exec);

// ─── helpers ───────────────────────────────────────────────────────────────

function formatDate(d: Date): string { return d.toISOString().split('T')[0]; }

function lastWeekRange(): { from: string; to: string; label: string } {
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() - now.getDay());
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { from: formatDate(start), to: formatDate(end), label: `${formatDate(start)} to ${formatDate(end)}` };
}

// ─── weekly usage report ───────────────────────────────────────────────────

async function runWeeklyReport() {
  try {
    const { from, to, label } = lastWeekRange();

    const [admins, usage, lowStock] = await Promise.all([
      query(`SELECT email FROM users WHERE role = 'admin' AND is_active = true`),
      query(`
        SELECT i.name, i.unit,
               SUM(sfi.quantity_used) as total_qty,
               SUM(sfi.total_charge)  as total_charge
        FROM stock_fulfillment_items sfi
        JOIN inventory_items i    ON sfi.inventory_item_id = i.id
        JOIN stock_fulfillments sf ON sfi.fulfillment_id   = sf.id
        WHERE DATE(sf.completed_at) BETWEEN $1 AND $2
        GROUP BY i.id, i.name, i.unit
        ORDER BY total_qty DESC
        LIMIT 10
      `, [from, to]),
      query(`
        SELECT name, unit, quantity_on_hand as qty, reorder_threshold as threshold
        FROM inventory_items
        WHERE is_active = true AND reorder_threshold > 0 AND quantity_on_hand <= reorder_threshold
        ORDER BY quantity_on_hand ASC LIMIT 10
      `),
    ]);

    const adminEmails = admins.rows.map((r: { email: string }) => r.email);
    if (adminEmails.length === 0) return;

    const totalQty    = usage.rows.reduce((s: number, r: { total_qty: string })    => s + parseFloat(r.total_qty    || '0'), 0);
    const totalCharge = usage.rows.reduce((s: number, r: { total_charge: string }) => s + parseFloat(r.total_charge || '0'), 0);

    await emailWeeklyReport({
      adminEmails,
      weekLabel:  label,
      totalItems: Math.round(totalQty),
      totalCharge,
      topItems: usage.rows.map((r: { name: string; total_qty: string; unit: string }) => ({
        name: r.name, qty: parseFloat(r.total_qty || '0'), unit: r.unit,
      })),
      lowStockItems: lowStock.rows.map((r: { name: string; qty: string; threshold: string; unit: string }) => ({
        name: r.name, qty: parseFloat(r.qty || '0'),
        threshold: parseFloat(r.threshold || '0'), unit: r.unit,
      })),
    });

    console.log(`[scheduler] Weekly report sent to ${adminEmails.length} admin(s)`);
  } catch (err) {
    console.error('[scheduler] Weekly report failed:', err);
  }
}

// ─── daily expiry alerts ───────────────────────────────────────────────────

async function runExpiryAlerts() {
  try {
    const configResult = await query('SELECT * FROM expiry_alert_config WHERE id = 1');
    const cfg = configResult.rows[0];
    if (!cfg) return;

    const daysOut: number[] = cfg.alert_days_out || [30, 14, 7, 1];

    // Build recipient list
    const recipients: string[] = [];
    if (cfg.email_admins) {
      const admins = await query(`SELECT email FROM users WHERE role IN ('admin','practice_manager') AND is_active = true`);
      recipients.push(...admins.rows.map((r: { email: string }) => r.email));
    }
    if (cfg.email_nurses) {
      const nurses = await query(`SELECT email FROM users WHERE role = 'nurse' AND is_active = true`);
      recipients.push(...nurses.rows.map((r: { email: string }) => r.email));
    }
    if (recipients.length === 0) return;

    for (const days of daysOut) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const dateStr = formatDate(targetDate);

      // Find batches expiring on this target date that haven't been alerted yet
      const batches = await query(`
        SELECT b.id, b.batch_number, b.expiry_date, b.quantity,
               i.name AS item_name, i.unit, i.controlled_schedule
        FROM inventory_batches b
        JOIN inventory_items i ON b.inventory_item_id = i.id
        WHERE b.expiry_date = $1
          AND b.quantity > 0
          AND b.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM expiry_alert_sent eas
            WHERE eas.batch_id = b.id AND eas.days_out = $2
          )
        ORDER BY i.name
      `, [dateStr, days]);

      if (batches.rows.length === 0) continue;

      // Mark as sent (before email, to avoid re-sends on crash)
      for (const batch of batches.rows) {
        await query(
          `INSERT INTO expiry_alert_sent (batch_id, days_out) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [batch.id, days]
        );
      }

      const rows = batches.rows.map((b: { item_name: string; batch_number: string; quantity: number; unit: string; controlled_schedule: string }) =>
        `<tr>
          <td>${b.item_name}</td>
          <td>${b.batch_number}</td>
          <td>${b.quantity} ${b.unit}</td>
          ${b.controlled_schedule ? `<td><strong>${b.controlled_schedule}</strong></td>` : '<td>—</td>'}
        </tr>`
      ).join('');

      const urgency = days <= 1 ? '⚠️ EXPIRING TOMORROW' : days <= 7 ? '⚠️ Expiring in 7 days' : `Expiring in ${days} days`;

      await sendMail(
        recipients,
        `S.H.I.T. Inventory — ${urgency} (${batches.rows.length} batch${batches.rows.length > 1 ? 'es' : ''})`,
        `<h2>${urgency}</h2>
         <p>The following batches expire on <strong>${dateStr}</strong>:</p>
         <table border="1" cellpadding="4" style="border-collapse:collapse">
           <tr><th>Item</th><th>Batch</th><th>Qty</th><th>Schedule</th></tr>
           ${rows}
         </table>
         <p>Please review and action accordingly.</p>`
      );

      console.log(`[scheduler] Expiry alert sent: ${batches.rows.length} batch(es) expiring in ${days} day(s)`);
    }
  } catch (err) {
    console.error('[scheduler] Expiry alert failed:', err);
  }
}

// ─── backup integrity check ────────────────────────────────────────────────

async function runBackupIntegrityCheck() {
  try {
    const backupDir = process.env.BACKUP_DIR || '/opt/medinv/backups';
    const dbName    = process.env.DB_NAME || 'medical_inventory';
    const dbUser    = process.env.DB_USER || 'medinv';
    const dbHost    = process.env.DB_HOST || 'postgres';

    // Find the most recent backup file
    let latestBackup: string | null = null;
    try {
      const { stdout } = await execAsync(
        `ls -t "${backupDir}"/pre_update_*.sql.gz "${backupDir}"/daily_*.sql.gz 2>/dev/null | head -1`
      );
      latestBackup = stdout.trim();
    } catch { /* no backup files found */ }

    const admins = await query(`SELECT email FROM users WHERE role = 'admin' AND is_active = true`);
    const adminEmails = admins.rows.map((r: { email: string }) => r.email);
    if (adminEmails.length === 0) return;

    if (!latestBackup) {
      await sendMail(
        adminEmails,
        'S.H.I.T. — Backup Alert: No backup files found',
        `<h2>⚠️ No backup files found</h2>
         <p>No backup files were found in <code>${backupDir}</code>.</p>
         <p>Please verify that the automated backup cron is running and check disk space.</p>`
      );
      console.log('[scheduler] Backup check: no backups found, alert sent');
      return;
    }

    // Check that the backup can be restored to a temp DB
    const tempDb = `backup_verify_${Date.now()}`;
    let rowCount = 0;
    let restoreOk = false;

    try {
      await execAsync(`createdb -h ${dbHost} -U ${dbUser} ${tempDb}`);
      await execAsync(`gunzip -c "${latestBackup}" | psql -h ${dbHost} -U ${dbUser} ${tempDb} -q`);
      const { stdout } = await execAsync(`psql -h ${dbHost} -U ${dbUser} ${tempDb} -t -c "SELECT COUNT(*) FROM inventory_items"`);
      rowCount = parseInt(stdout.trim()) || 0;
      restoreOk = true;
    } catch (err) {
      console.error('[scheduler] Backup restore test failed:', err);
    } finally {
      try { await execAsync(`dropdb -h ${dbHost} -U ${dbUser} --if-exists ${tempDb}`); } catch { /* ignore */ }
    }

    const backupFile = latestBackup.split('/').pop();

    if (restoreOk) {
      await sendMail(
        adminEmails,
        'S.H.I.T. — ✅ Weekly backup verified',
        `<h2>✅ Backup integrity check passed</h2>
         <ul>
           <li>Backup file: <code>${backupFile}</code></li>
           <li>Restore test: <strong>successful</strong></li>
           <li>Inventory item rows verified: <strong>${rowCount}</strong></li>
         </ul>
         <p>Your backup is restorable.</p>`
      );
      console.log(`[scheduler] Backup check passed: ${backupFile}, ${rowCount} inventory rows`);
    } else {
      await sendMail(
        adminEmails,
        '⚠️ S.H.I.T. — Backup integrity check FAILED',
        `<h2>⚠️ Backup restore test failed</h2>
         <p>The most recent backup <code>${backupFile}</code> could not be successfully restored to a test database.</p>
         <p>Please investigate immediately. Your backup may be corrupt or incomplete.</p>`
      );
      console.error(`[scheduler] Backup check FAILED for ${backupFile}`);
    }
  } catch (err) {
    console.error('[scheduler] Backup integrity check failed:', err);
  }
}

// ─── scheduler entry point ─────────────────────────────────────────────────

export async function startScheduledReports() {
  const settings = await getSettings();
  const timezone = settings.report_timezone || 'UTC';

  // Weekly usage report — Monday 08:00
  cron.schedule('0 8 * * 1', () => {
    console.log('[scheduler] Running weekly report…');
    runWeeklyReport();
  }, { timezone });

  // Daily expiry alerts — 08:00
  cron.schedule('0 8 * * *', () => {
    console.log('[scheduler] Running expiry alerts…');
    runExpiryAlerts();
  }, { timezone });

  // Weekly backup integrity check — Sunday 04:00
  cron.schedule('0 4 * * 0', () => {
    console.log('[scheduler] Running backup integrity check…');
    runBackupIntegrityCheck();
  }, { timezone });

  console.log(`[scheduler] All jobs scheduled (${timezone})`);
  console.log(`[scheduler]   Weekly report:       Mon 08:00`);
  console.log(`[scheduler]   Expiry alerts:        Daily 08:00`);
  console.log(`[scheduler]   Backup integrity:     Sun 04:00`);
}
