/**
 * Webhook retry worker — runs every 2 minutes to process pending/failed deliveries.
 */
import cron from 'node-cron';
import { query } from '../db';
import { deliverWebhook } from '../utils/webhooks';

export async function processWebhookQueue(): Promise<void> {
  const pending = await query(`
    SELECT id FROM webhook_deliveries
    WHERE status = 'pending'
      AND next_retry_at <= NOW()
    ORDER BY next_retry_at
    LIMIT 20
  `);

  for (const row of pending.rows) {
    try {
      await deliverWebhook(row.id);
    } catch (err) {
      console.error(`[webhooks] Delivery ${row.id} threw:`, err);
    }
  }
}

export function startWebhookRetryJob(): void {
  // Run every 2 minutes
  cron.schedule('*/2 * * * *', () => {
    processWebhookQueue().catch(err => console.error('[webhooks] Queue error:', err));
  });
  console.log('[webhooks] Retry job scheduled (every 2 minutes)');
}
