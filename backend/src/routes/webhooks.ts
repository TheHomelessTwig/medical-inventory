/**
 * Webhook subscription management.
 *
 * GET    /api/webhooks              — list subscriptions
 * POST   /api/webhooks              — create subscription
 * PUT    /api/webhooks/:id          — update subscription
 * DELETE /api/webhooks/:id          — delete subscription
 * GET    /api/webhooks/:id/deliveries — delivery history
 * POST   /api/webhooks/:id/test     — send a test ping
 * GET    /api/webhooks/events       — list available event types
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { WEBHOOK_EVENTS, deliverWebhook, signPayload } from '../utils/webhooks';

const router = Router();
router.use(authenticate, requireAdmin);

const subSchema = z.object({
  url:         z.string().url(),
  events:      z.array(z.string()).min(1),
  description: z.string().optional().nullable(),
  secret:      z.string().min(8).optional(),  // auto-generated if omitted
});

// GET /api/webhooks/events
router.get('/events', (_req: Request, res: Response): void => {
  res.json(WEBHOOK_EVENTS);
});

// GET /api/webhooks
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT id, url, events, description, is_active, created_at,
             (SELECT COUNT(*) FROM webhook_deliveries wd WHERE wd.subscription_id = ws.id) AS delivery_count,
             (SELECT COUNT(*) FROM webhook_deliveries wd WHERE wd.subscription_id = ws.id AND wd.status='delivered') AS delivered_count
      FROM webhook_subscriptions ws ORDER BY created_at DESC
    `);
    // Never return the secret in the list
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/webhooks
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = subSchema.parse(req.body);
    const secret = body.secret ?? crypto.randomBytes(32).toString('hex');

    const result = await query(`
      INSERT INTO webhook_subscriptions (url, events, description, secret, created_by)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, url, events, description, is_active, created_at
    `, [body.url, body.events, body.description, secret, req.user!.id]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'WEBHOOK_CREATED', entityType: 'webhook', entityId: result.rows[0].id, entityName: body.url, ipAddress, userAgent });

    // Return secret once on creation — never again
    res.status(201).json({ ...result.rows[0], secret });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors[0].message }); return; }
    next(err);
  }
});

// PUT /api/webhooks/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = subSchema.partial().parse(req.body);
    const result = await query(`
      UPDATE webhook_subscriptions SET
        url         = COALESCE($1, url),
        events      = COALESCE($2, events),
        description = COALESCE($3, description),
        is_active   = COALESCE($4, is_active)
      WHERE id = $5
      RETURNING id, url, events, description, is_active
    `, [body.url, body.events, body.description,
        (req.body as Record<string, unknown>).is_active ?? null, req.params.id]);

    if (result.rows.length === 0) { res.status(404).json({ error: 'Subscription not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors[0].message }); return; }
    next(err);
  }
});

// DELETE /api/webhooks/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`DELETE FROM webhook_subscriptions WHERE id=$1 RETURNING url`, [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Subscription not found' }); return; }
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'WEBHOOK_DELETED', entityType: 'webhook', entityId: req.params.id, entityName: result.rows[0].url, ipAddress, userAgent });
    res.json({ message: 'Subscription deleted' });
  } catch (err) { next(err); }
});

// GET /api/webhooks/:id/deliveries
router.get('/:id/deliveries', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT id, event, status, attempts, response_code, last_attempt_at, created_at
      FROM webhook_deliveries WHERE subscription_id = $1
      ORDER BY created_at DESC LIMIT 100
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/webhooks/:id/test — send a test ping
router.post('/:id/test', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sub = await query(`SELECT * FROM webhook_subscriptions WHERE id=$1`, [req.params.id]);
    if (sub.rows.length === 0) { res.status(404).json({ error: 'Subscription not found' }); return; }

    const payload = JSON.stringify({ event: 'ping', timestamp: new Date().toISOString(), data: { message: 'Test ping from S.H.I.T.' } });
    const sig = signPayload(sub.rows[0].secret, payload);

    let status = 0, body = '';
    try {
      const r = await fetch(sub.rows[0].url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SHIT-Signature': sig, 'X-SHIT-Event': 'ping' },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });
      status = r.status;
      body = (await r.text()).slice(0, 200);
    } catch (err) { body = String(err).slice(0, 200); }

    res.json({ url: sub.rows[0].url, response_code: status, response_body: body, success: status >= 200 && status < 300 });
  } catch (err) { next(err); }
});

export default router;
