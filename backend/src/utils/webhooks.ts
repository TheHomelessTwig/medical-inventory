/**
 * Outbound webhook emitter.
 *
 * Usage:
 *   await emitWebhookEvent('request.fulfilled', { request_id, doctor_id, ... });
 *
 * Payloads are signed with HMAC-SHA256 using each subscription's secret.
 * Deliveries are recorded in webhook_deliveries and retried by the
 * webhook retry job (up to 5 attempts with exponential backoff).
 */

import crypto from 'crypto';
import { query } from '../db';

export const WEBHOOK_EVENTS = [
  'stock.low',
  'stock.expired',
  'request.created',
  'request.fulfilled',
  'request.quick_charge',
  'invoice.posted',
  'purchase_order.received',
  'stocktake.completed',
  'recall.created',
  'transfer.received',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

export async function emitWebhookEvent(event: WebhookEvent | string, data: object): Promise<void> {
  try {
    const subs = await query(
      `SELECT id FROM webhook_subscriptions WHERE is_active = true AND $1 = ANY(events)`,
      [event]
    );
    if (subs.rows.length === 0) return;

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    for (const sub of subs.rows) {
      await query(`
        INSERT INTO webhook_deliveries (subscription_id, event, payload, status, next_retry_at)
        VALUES ($1, $2, $3, 'pending', NOW())
      `, [sub.id, event, JSON.stringify(payload)]);
    }
  } catch (err) {
    // Webhook failures must never crash the main request
    console.error('[webhooks] emitWebhookEvent failed:', err);
  }
}

export function signPayload(secret: string, body: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Deliver one pending webhook_deliveries row. */
export async function deliverWebhook(deliveryId: string): Promise<void> {
  const row = await query(`
    SELECT wd.*, ws.url, ws.secret
    FROM webhook_deliveries wd
    JOIN webhook_subscriptions ws ON wd.subscription_id = ws.id
    WHERE wd.id = $1
  `, [deliveryId]);

  if (row.rows.length === 0) return;
  const d = row.rows[0];
  const body = JSON.stringify(d.payload);
  const sig  = signPayload(d.secret, body);

  let responseCode = 0;
  let responseBody = '';
  let success = false;

  try {
    const res = await fetch(d.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SHIT-Signature': sig,
        'X-SHIT-Event': d.event,
        'X-SHIT-Delivery': deliveryId,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    responseCode = res.status;
    responseBody = (await res.text()).slice(0, 500);
    success = res.ok;
  } catch (err) {
    responseBody = String(err).slice(0, 500);
  }

  const attempts = d.attempts + 1;
  const maxAttempts = 5;
  // Exponential backoff: 1m, 5m, 30m, 2h, 8h
  const backoffMinutes = [1, 5, 30, 120, 480];
  const nextRetry = success || attempts >= maxAttempts
    ? null
    : new Date(Date.now() + (backoffMinutes[attempts - 1] ?? 480) * 60_000);

  await query(`
    UPDATE webhook_deliveries SET
      status          = $1,
      attempts        = $2,
      last_attempt_at = NOW(),
      response_code   = $3,
      response_body   = $4,
      next_retry_at   = $5
    WHERE id = $6
  `, [
    success ? 'delivered' : (attempts >= maxAttempts ? 'failed' : 'pending'),
    attempts, responseCode, responseBody, nextRetry, deliveryId,
  ]);
}
