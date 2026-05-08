/**
 * Scheduled jobs — weekly email report every Monday at 8am.
 * Started in index.ts (not in test environment).
 */

import cron from 'node-cron';
import { query } from '../db';
import { emailWeeklyReport } from '../utils/email';

// date-fns may not be installed — use built-in Date math instead
function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function lastWeekRange(): { from: string; to: string; label: string } {
  const now = new Date();
  // Last week Mon–Sun
  const end = new Date(now);
  end.setDate(now.getDate() - now.getDay()); // last Sunday
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - 6); // Monday
  start.setHours(0, 0, 0, 0);
  return {
    from: formatDate(start),
    to:   formatDate(end),
    label: `${formatDate(start)} to ${formatDate(end)}`,
  };
}

async function runWeeklyReport() {
  try {
    const { from, to, label } = lastWeekRange();

    const [admins, usage, lowStock] = await Promise.all([
      query(`SELECT email FROM users WHERE role = 'admin' AND is_active = true`),
      query(`
        SELECT i.name, i.unit,
               SUM(sfi.quantity_used) as total_qty,
               SUM(sfi.total_charge) as total_charge
        FROM stock_fulfillment_items sfi
        JOIN inventory_items i ON sfi.inventory_item_id = i.id
        JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
        WHERE DATE(sf.completed_at) BETWEEN $1 AND $2
        GROUP BY i.id, i.name, i.unit
        ORDER BY total_qty DESC
        LIMIT 10
      `, [from, to]),
      query(`
        SELECT name, unit, quantity_on_hand as qty, reorder_threshold as threshold
        FROM inventory_items
        WHERE is_active = true
          AND reorder_threshold > 0
          AND quantity_on_hand <= reorder_threshold
        ORDER BY quantity_on_hand ASC
        LIMIT 10
      `),
    ]);

    const adminEmails = admins.rows.map((r: { email: string }) => r.email);
    if (adminEmails.length === 0) return;

    const totalQty    = usage.rows.reduce((s: number, r: { total_qty: string }) => s + parseFloat(r.total_qty || '0'), 0);
    const totalCharge = usage.rows.reduce((s: number, r: { total_charge: string }) => s + parseFloat(r.total_charge || '0'), 0);

    await emailWeeklyReport({
      adminEmails,
      weekLabel: label,
      totalItems: Math.round(totalQty),
      totalCharge,
      topItems: usage.rows.map((r: { name: string; total_qty: string; unit: string }) => ({
        name: r.name,
        qty:  parseFloat(r.total_qty || '0'),
        unit: r.unit,
      })),
      lowStockItems: lowStock.rows.map((r: { name: string; qty: string; threshold: string; unit: string }) => ({
        name: r.name,
        qty:  parseFloat(r.qty || '0'),
        threshold: parseFloat(r.threshold || '0'),
        unit: r.unit,
      })),
    });

    console.log(`[scheduler] Weekly report sent to ${adminEmails.length} admin(s)`);
  } catch (err) {
    console.error('[scheduler] Weekly report failed:', err);
  }
}

export function startScheduledReports() {
  const timezone = process.env.REPORT_TIMEZONE || 'UTC';

  // Every Monday at 8am clinic time
  cron.schedule('0 8 * * 1', () => {
    console.log('[scheduler] Running weekly report...');
    runWeeklyReport();
  }, { timezone });

  console.log(`[scheduler] Weekly report scheduled (${timezone}, Mondays 08:00)`);
}
