/**
 * Email utility — wraps nodemailer.
 *
 * SMTP config is read from the admin_settings DB table on every call,
 * falling back to env vars (SMTP_HOST etc.) if not configured in the UI.
 * If no host is configured the functions are no-ops (silently skipped).
 */

import nodemailer from 'nodemailer';
import { getSettings } from '../services/settings';

export async function sendMail(to: string | string[], subject: string, html: string): Promise<void> {
  try {
    const s = await getSettings();
    if (!s.smtp_host) return; // Email not configured — skip silently

    const transport = nodemailer.createTransport({
      host:   s.smtp_host,
      port:   s.smtp_port,
      secure: s.smtp_secure,
      auth:   s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass || '' } : undefined,
      tls:    { rejectUnauthorized: false },
    });

    await transport.sendMail({
      from: s.smtp_from,
      to:   Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
    });
  } catch (err) {
    // Email failures must not crash the API
    console.error('[email] Failed to send:', subject, err);
  }
}

/** Verify SMTP connectivity — used by the settings test-email button. */
export async function testEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const s = await getSettings();
    if (!s.smtp_host) return { ok: false, error: 'SMTP host is not configured.' };

    const transport = nodemailer.createTransport({
      host:   s.smtp_host,
      port:   s.smtp_port,
      secure: s.smtp_secure,
      auth:   s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass || '' } : undefined,
      tls:    { rejectUnauthorized: false },
    });

    await transport.verify();
    await transport.sendMail({
      from:    s.smtp_from,
      to,
      subject: 'S.H.I.T. — Test email',
      html:    layout('Test Email', '<h2>Test successful!</h2><p>Your email settings are working correctly.</p>'),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function layout(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
  .card { background: #fff; border-radius: 12px; padding: 32px; max-width: 520px; margin: 0 auto; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .header { text-align: center; margin-bottom: 24px; }
  .logo { font-size: 28px; font-weight: 900; letter-spacing: .2em; color: #2563eb; }
  .sub { color: #64748b; font-size: 12px; margin-top: 2px; }
  h2 { margin: 0 0 16px; font-size: 18px; color: #0f172a; }
  p { margin: 0 0 12px; line-height: 1.6; font-size: 14px; color: #475569; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; background: #eff6ff; color: #2563eb; }
  .btn { display: inline-block; margin-top: 20px; padding: 10px 24px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
  .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="logo">S.H.I.T.</div>
    <div class="sub">Sam's Helpful Inventory Tracker</div>
  </div>
  ${body}
  <div class="footer">This is an automated message from S.H.I.T. &mdash; do not reply.</div>
</div>
</body>
</html>`;
}

// ── App URL helper ─────────────────────────────────────────────────────────────
// Synchronous for use in email template strings; reads env var directly.
// The DB-stored app_url takes effect via the settings page on next send.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ── Typed notification functions ───────────────────────────────────────────────

export function emailNewRequest(opts: {
  nurseEmails: string[];
  requestNumber: string;
  doctorName: string;
  patientName?: string;
  priority: string;
  itemCount: number;
}) {
  const priorityColor: Record<string, string> = {
    urgent: '#ef4444', high: '#f59e0b', normal: '#2563eb', low: '#64748b',
  };
  const color = priorityColor[opts.priority] || '#2563eb';
  const body = `
    <h2>New Stock Request</h2>
    <p>A new request has been raised and is waiting for action.</p>
    <table>
      <tr><th>Request</th><td><strong>${opts.requestNumber}</strong></td></tr>
      <tr><th>Doctor</th><td>${opts.doctorName}</td></tr>
      ${opts.patientName ? `<tr><th>Patient</th><td>${opts.patientName}</td></tr>` : ''}
      <tr><th>Priority</th><td><span class="badge" style="background:${color}20;color:${color}">${opts.priority.toUpperCase()}</span></td></tr>
      <tr><th>Items</th><td>${opts.itemCount} item type${opts.itemCount !== 1 ? 's' : ''}</td></tr>
    </table>
    <a class="btn" href="${APP_URL}/requests">View Request</a>`;
  return sendMail(opts.nurseEmails, `[S.H.I.T.] New ${opts.priority} request from ${opts.doctorName}`, layout('New Request', body));
}

export function emailRequestFulfilled(opts: {
  doctorEmail: string;
  requestNumber: string;
  nurseName: string;
  totalCharge: number;
  items: Array<{ item_name: string; quantity_used: number; unit: string }>;
}) {
  const rows = opts.items.map(i =>
    `<tr><td>${i.item_name}</td><td>${i.quantity_used} ${i.unit}</td></tr>`
  ).join('');
  const body = `
    <h2>Request Fulfilled</h2>
    <p>Your stock request <strong>${opts.requestNumber}</strong> has been fulfilled by ${opts.nurseName}.</p>
    <table>
      <tr><th>Item</th><th>Qty Used</th></tr>
      ${rows}
    </table>
    <p><strong>Total charge: $${opts.totalCharge.toFixed(2)}</strong></p>
    <a class="btn" href="${APP_URL}/requests">View Receipt</a>`;
  return sendMail(opts.doctorEmail, `[S.H.I.T.] Request ${opts.requestNumber} fulfilled by ${opts.nurseName}`, layout('Request Fulfilled', body));
}

export function emailAccountLocked(opts: { adminEmails: string[]; lockedEmail: string; ipAddress?: string }) {
  const body = `
    <h2>Account Locked</h2>
    <p>The account <strong>${opts.lockedEmail}</strong> has been locked after too many failed login attempts.</p>
    ${opts.ipAddress ? `<p>Last attempt from IP: <code>${opts.ipAddress}</code></p>` : ''}
    <p>The account will unlock automatically after 15 minutes.</p>
    <a class="btn" href="${APP_URL}/users">Manage Users</a>`;
  return sendMail(opts.adminEmails, `[S.H.I.T.] Account locked: ${opts.lockedEmail}`, layout('Account Locked', body));
}

export function emailAfterHoursLogin(opts: { adminEmails: string[]; userName: string; role: string; ipAddress?: string; time: string }) {
  const body = `
    <h2>After-Hours Login Detected</h2>
    <p>A login occurred outside normal business hours (7am–8pm).</p>
    <table>
      <tr><th>User</th><td>${opts.userName}</td></tr>
      <tr><th>Role</th><td>${opts.role}</td></tr>
      <tr><th>Time</th><td>${opts.time}</td></tr>
      ${opts.ipAddress ? `<tr><th>IP</th><td>${opts.ipAddress}</td></tr>` : ''}
    </table>
    <p>If this was unexpected, review the <a href="${APP_URL}/audit">audit log</a>.</p>`;
  return sendMail(opts.adminEmails, `[S.H.I.T.] After-hours login: ${opts.userName}`, layout('After-Hours Login', body));
}

export function emailQuickCharge(opts: {
  doctorEmail: string;
  requestNum: string;
  nurseName: string;
  patientName?: string;
  totalCharge: number;
}) {
  const body = `
    <h2>Quick Charge Receipt</h2>
    <p>${opts.nurseName} has recorded a stock charge against your account.</p>
    <table>
      <tr><th>Reference</th><td><strong>${opts.requestNum}</strong></td></tr>
      ${opts.patientName ? `<tr><th>Patient</th><td>${opts.patientName}</td></tr>` : ''}
      <tr><th>Nurse</th><td>${opts.nurseName}</td></tr>
      <tr><th>Total Charge</th><td><strong>$${opts.totalCharge.toFixed(2)}</strong></td></tr>
    </table>
    <a class="btn" href="${APP_URL}/requests">View Receipt</a>`;
  return sendMail(opts.doctorEmail, `[S.H.I.T.] Quick charge ${opts.requestNum} from ${opts.nurseName}`, layout('Quick Charge', body));
}

export function emailWeeklyReport(opts: {
  adminEmails: string[];
  weekLabel: string;
  totalItems: number;
  totalCharge: number;
  topItems: Array<{ name: string; qty: number; unit: string }>;
  lowStockItems: Array<{ name: string; qty: number; threshold: number; unit: string }>;
}) {
  const topRows = opts.topItems.slice(0, 10).map(i =>
    `<tr><td>${i.name}</td><td>${i.qty} ${i.unit}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="color:#94a3b8">No usage this week</td></tr>';

  const lowRows = opts.lowStockItems.slice(0, 10).map(i =>
    `<tr><td>${i.name}</td><td style="color:#ef4444">${i.qty}/${i.threshold} ${i.unit}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="color:#10b981">All items above threshold ✓</td></tr>';

  const body = `
    <h2>Weekly Summary — ${opts.weekLabel}</h2>
    <table>
      <tr><th>Total items dispensed</th><td>${opts.totalItems}</td></tr>
      <tr><th>Total charges</th><td><strong>$${opts.totalCharge.toFixed(2)}</strong></td></tr>
    </table>
    <h3 style="margin:20px 0 8px;font-size:14px">Top Used Items</h3>
    <table><tr><th>Item</th><th>Qty Used</th></tr>${topRows}</table>
    <h3 style="margin:20px 0 8px;font-size:14px">Low Stock Alerts</h3>
    <table><tr><th>Item</th><th>Stock / Threshold</th></tr>${lowRows}</table>
    <a class="btn" href="${APP_URL}/reports">View Full Reports</a>`;
  return sendMail(opts.adminEmails, `[S.H.I.T.] Weekly Report — ${opts.weekLabel}`, layout('Weekly Report', body));
}
