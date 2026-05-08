import dotenv from 'dotenv';
dotenv.config();

import pool from './db';
import { runMigrations } from './db/migrate';
import app from './app';

const PORT = process.env.PORT || 4000;

async function main() {
  // Run database migrations before accepting traffic
  try {
    await runMigrations(pool);
  } catch (err) {
    console.error('[startup] Migration failed — aborting:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`S.H.I.T. API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    if (process.env.NODE_ENV !== 'test') {
      // Scheduled reports: weekly email, daily expiry alerts, backup check
      import('./jobs/scheduledReports').then(({ startScheduledReports }) => {
        startScheduledReports();
      }).catch(console.error);

      // Nightly data retention job
      import('./jobs/retentionJob').then(({ startRetentionJob }) => {
        startRetentionJob();
      }).catch(console.error);

      // Nightly expired-batch write-off (01:00)
      import('./jobs/expiryWriteoff').then(({ startExpiryWriteoffJob }) => {
        startExpiryWriteoffJob();
      }).catch(console.error);

      // Webhook retry queue (every 2 minutes)
      import('./jobs/webhookRetry').then(({ startWebhookRetryJob }) => {
        startWebhookRetryJob();
      }).catch(console.error);

      // Stocktake scheduler (daily 07:00)
      import('./jobs/stocktakeScheduler').then(({ startStocktakeSchedulerJob }) => {
        startStocktakeSchedulerJob();
      }).catch(console.error);

      // Built-in DB backup (schedule configured in admin settings)
      import('./jobs/backupJob').then(({ startBackupJob }) => {
        startBackupJob();
      }).catch(console.error);
    }
  });
}

main();

export default app;
