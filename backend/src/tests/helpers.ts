import supertest from 'supertest';
import app from '../app';
import { query } from '../db';

export const api = supertest(app);

/** Get a valid JWT access token for a test user. */
export async function getToken(
  email = 'admin@test.local',
  password = 'Admin123!'
): Promise<string> {
  const res = await api.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

/** Authenticated GET helper. */
export const authGet = (token: string) => (url: string) =>
  api.get(url).set('Authorization', `Bearer ${token}`);

/** Authenticated POST helper. */
export const authPost = (token: string) => (url: string, body?: object) =>
  api.post(url).set('Authorization', `Bearer ${token}`).send(body);

/** Authenticated PUT helper. */
export const authPut = (token: string) => (url: string, body?: object) =>
  api.put(url).set('Authorization', `Bearer ${token}`).send(body);

/** Authenticated DELETE helper. */
export const authDelete = (token: string) => (url: string) =>
  api.delete(url).set('Authorization', `Bearer ${token}`);

/** Fetch a single row by ID from any table. */
export async function dbRow(table: string, id: string) {
  const res = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

/**
 * Wipe all transient data between tests using DELETE (not TRUNCATE).
 * DELETE is DML — it doesn't grab the exclusive DDL-level lock that TRUNCATE
 * does, so it doesn't deadlock with concurrent INSERT/UPDATE in other tests.
 * Deletes in FK-safe order (children before parents).
 * Also resets user lockout state so auth tests don't bleed into each other.
 */
export async function clearTransactionalData(): Promise<void> {
  await query('DELETE FROM stock_fulfillment_items');
  await query('DELETE FROM stock_fulfillments');
  await query('DELETE FROM stock_request_items');
  await query('DELETE FROM stock_requests');
  await query('DELETE FROM stock_adjustments');
  await query('DELETE FROM stocktake_items');
  await query('DELETE FROM stocktakes');
  await query('DELETE FROM invoice_items');
  await query('DELETE FROM invoices');
  await query('DELETE FROM inventory_batches');
  await query('DELETE FROM inventory_items');
  await query('DELETE FROM refresh_tokens');
  // Reset any account lockouts so auth tests start clean
  await query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL');
}
