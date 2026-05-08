/**
 * Scheduled stocktake creator — runs daily at 07:00.
 * Checks stocktake_schedules where next_due_at <= NOW(), creates the stocktake
 * session, emails staff, and advances next_due_at.
 */

import cron from 'node-cron';
import { query, withTransaction } from '../db';
import { getSettings } from '../services/settings';
import { sendMail } from '../utils/email';

function addPeriod(date: Date, frequency: string): Date {
  const d = new Date(date);
  if (frequency === 'weekly')    d.setDate(d.getDate() + 7);
  if (frequency === 'monthly')   d.setMonth(d.getMonth() + 1);
  if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  return d;
}

export async function runStocktakeScheduler(): Promise<void> {
  const due = await query(`
    SELECT * FROM stocktake_schedules
    WHERE is_active = true AND next_due_at <= NOW()
  `);

  for (const sched of due.rows) {
    try {
      await withTransaction(async (client) => {
        // Build item list
        let itemQuery = `SELECT id, quantity_on_hand FROM inventory_items WHERE is_active = true`;
        const itemParams: unknown[] = [];
        let ip = 1;
        if (sched.stocktake_type === 'partial') {
          if (sched.scope_category_id) {
            itemQuery += ` AND category_id = $${ip++}`;
            itemParams.push(sched.scope_category_id);
          } else if (sched.scope_location) {
            itemQuery += ` AND storage_location ILIKE $${ip++}`;
            itemParams.push(`%${sched.scope_location}%`);
          }
        }
        const items = await client.query(itemQuery, itemParams);

        const sessionName = `${sched.name} — Scheduled ${new Date().toISOString().split('T')[0]}`;

        const stResult = await client.query(`
          INSERT INTO stocktakes
            (name, type, scope_description, scope_category_id, scope_location,
             notes, created_by, total_items)
          VALUES ($1,$2,$3,$4,$5,$6,
            (SELECT id FROM users WHERE role='admin' AND is_active=true LIMIT 1),
            $7)
          RETURNING id
        `, [
          sessionName,
          sched.stocktake_type,
          `Auto-created by schedule: ${sched.name}`,
          sched.scope_category_id,
          sched.scope_location,
          `Scheduled stocktake — created automatically`,
          items.rows.length,
        ]);

        const stocktakeId = stResult.rows[0].id;
        for (const item of items.rows) {
          await client.query(
            `INSERT INTO stocktake_items (stocktake_id, inventory_item_id, expected_quantity)
             VALUES ($1,$2,$3)`,
            [stocktakeId, item.id, item.quantity_on_hand]
          );
        }

        // Advance next_due_at
        const nextDue = addPeriod(new Date(sched.next_due_at), sched.frequency);
        await client.query(
          `UPDATE stocktake_schedules SET last_run_at = NOW(), next_due_at = $1 WHERE id = $2`,
          [nextDue.toISOString(), sched.id]
        );

        // Email staff
        const staffResult = await client.query(
          `SELECT email FROM users WHERE role IN ('admin','practice_manager','nurse') AND is_active=true`
        );
        const emails: string[] = [
          ...staffResult.rows.map((r: { email: string }) => r.email),
          ...(sched.notify_emails ?? []),
        ];
        const uniqueEmails = [...new Set(emails)];

        if (uniqueEmails.length > 0) {
          await sendMail(
            uniqueEmails,
            `S.H.I.T. — Scheduled stocktake ready: ${sessionName}`,
            `<h2>Scheduled Stocktake Created</h2>
             <p>A new stocktake session has been created automatically:</p>
             <ul>
               <li><strong>Name:</strong> ${sessionName}</li>
               <li><strong>Type:</strong> ${sched.stocktake_type}</li>
               <li><strong>Items:</strong> ${items.rows.length}</li>
             </ul>
             <p>Please log in to complete the count.</p>`
          );
        }

        console.log(`[stocktake-scheduler] Created "${sessionName}" (${items.rows.length} items); next due ${nextDue.toISOString().split('T')[0]}`);
      });
    } catch (err) {
      console.error(`[stocktake-scheduler] Failed for schedule ${sched.id}:`, err);
    }
  }
}

export async function startStocktakeSchedulerJob(): Promise<void> {
  const settings = await getSettings();
  const timezone = settings.report_timezone || 'UTC';
  cron.schedule('0 7 * * *', () => {
    console.log('[stocktake-scheduler] Checking due schedules…');
    runStocktakeScheduler().catch(err => console.error('[stocktake-scheduler] Error:', err));
  }, { timezone });
  console.log(`[stocktake-scheduler] Daily check scheduled (${timezone}, 07:00)`);
}
