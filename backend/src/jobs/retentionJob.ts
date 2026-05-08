/**
 * Data retention job.
 *
 * Runs on a configurable schedule (default: nightly at 3am).
 *  1. Archives audit_log rows older than audit_log_retain_days → audit_log_archive
 *  2. Deletes archived rows from audit_log
 *  3. If anonymise_patient_refs=true, anonymises patient_name/patient_ref in
 *     stock_requests older than patient_data_retain_days
 */

import cron from 'node-cron';
import { query, withTransaction } from '../db';
import { getSettings } from '../services/settings';

export interface RetentionSummary {
  audit_rows_archived:    number;
  patient_rows_anonymised: number;
  ran_at:                 string;
}

export async function runRetentionJob(): Promise<RetentionSummary> {
  const config = await query('SELECT * FROM data_retention_config WHERE id = 1');
  const cfg = config.rows[0];

  let auditArchived    = 0;
  let patientAnonymised = 0;

  await withTransaction(async (client) => {
    // --- Audit log archiving ---
    const archiveCutoff = new Date();
    archiveCutoff.setDate(archiveCutoff.getDate() - cfg.audit_log_retain_days);

    const archived = await client.query(`
      INSERT INTO audit_log_archive
        SELECT * FROM audit_log WHERE created_at < $1
      ON CONFLICT DO NOTHING
    `, [archiveCutoff.toISOString()]);
    auditArchived = archived.rowCount ?? 0;

    if (auditArchived > 0) {
      await client.query(`DELETE FROM audit_log WHERE created_at < $1`, [archiveCutoff.toISOString()]);
    }

    // --- Patient data anonymisation ---
    if (cfg.anonymise_patient_refs) {
      const patientCutoff = new Date();
      patientCutoff.setDate(patientCutoff.getDate() - cfg.patient_data_retain_days);

      const anonymised = await client.query(`
        UPDATE stock_requests
        SET patient_name = '[Anonymised]',
            patient_ref  = '[Anonymised]'
        WHERE created_at < $1
          AND (patient_name IS NOT NULL OR patient_ref IS NOT NULL)
          AND patient_name != '[Anonymised]'
      `, [patientCutoff.toISOString()]);
      patientAnonymised = anonymised.rowCount ?? 0;
    }

    // Update last run timestamp
    await client.query(
      `UPDATE data_retention_config SET last_retention_run = NOW() WHERE id = 1`
    );
  });

  const summary: RetentionSummary = {
    audit_rows_archived:    auditArchived,
    patient_rows_anonymised: patientAnonymised,
    ran_at: new Date().toISOString(),
  };

  console.log(`[retention] Archived ${auditArchived} audit rows, anonymised ${patientAnonymised} patient records`);
  return summary;
}

export async function startRetentionJob(): Promise<void> {
  const settings = await getSettings();
  const timezone = settings.report_timezone || 'UTC';
  // Nightly at 3am
  cron.schedule('0 3 * * *', () => {
    console.log('[retention] Running nightly retention job…');
    runRetentionJob().catch(err => console.error('[retention] Job failed:', err));
  }, { timezone });
  console.log(`[retention] Nightly retention job scheduled (${timezone}, 03:00)`);
}
