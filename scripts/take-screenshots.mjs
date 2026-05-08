/**
 * Screenshot capture script for S.H.I.T. documentation.
 *
 * Usage:
 *   cd scripts && node take-screenshots.mjs
 *
 * Logs in as admin, doctor, and nurse — captures every key page in both
 * light and dark mode. Saves to ../docs/screenshots/
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const BASE   = 'http://localhost:3000';
const ADMIN  = { email: 'admin@clinic.local',  password: 'Admin123!' };
const DOCTOR = { email: 'doctor@clinic.local', password: 'Doctor123!' };
const NURSE  = { email: 'nurse@clinic.local',  password: 'Nurse123!' };

const VIEWPORT = { width: 1440, height: 900 };

// ── helpers ──────────────────────────────────────────────────────────────────

async function logout(page) {
  // Clear tokens from localStorage to force a clean login
  await page.evaluate(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  });
}

async function login(page, creds) {
  // Ensure we're logged out first
  await logout(page);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.click('input[type="email"]');
  await page.type('input[type="email"]', creds.email, { delay: 20 });
  await page.click('input[type="password"]');
  await page.type('input[type="password"]', creds.password, { delay: 20 });
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 12000 });
}

async function shot(page, filename, { waitFor, delay = 700 } = {}) {
  await page.evaluate(() => window.scrollTo(0, 0));
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 8000 }).catch(() => {});
  await new Promise(r => setTimeout(r, delay));
  const file = path.join(OUT, filename);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${filename}`);
}

async function setDark(page, on) {
  await page.evaluate((dark) => {
    localStorage.setItem('shit-mode', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', dark);
  }, on);
  await new Promise(r => setTimeout(r, 350));
}

// ── main ─────────────────────────────────────────────────────────────────────

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  defaultViewport: VIEWPORT,
});

console.log('\n📸  S.H.I.T. Documentation Screenshots\n');

try {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // ── 1. Login page ─────────────────────────────────────────────────────────
  console.log('→ Login');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await shot(page, 'login.png', { waitFor: 'h1' });

  // ── Sign in as Admin ──────────────────────────────────────────────────────
  await login(page, ADMIN);

  // ── 2. Dashboard (light) ─────────────────────────────────────────────────
  console.log('→ Dashboard (light)');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await shot(page, 'dashboard.png', { waitFor: '.card', delay: 900 });

  // ── 3. Dashboard (dark) ───────────────────────────────────────────────────
  console.log('→ Dashboard (dark)');
  await setDark(page, true);
  await shot(page, 'dashboard-dark.png');
  await setDark(page, false);

  // ── 4. Inventory ──────────────────────────────────────────────────────────
  console.log('→ Inventory');
  await page.goto(`${BASE}/inventory`, { waitUntil: 'networkidle0' });
  await shot(page, 'inventory.png', { delay: 900 });

  // ── 5. Requests ───────────────────────────────────────────────────────────
  console.log('→ Requests');
  await page.goto(`${BASE}/requests`, { waitUntil: 'networkidle0' });
  await shot(page, 'requests.png', { delay: 700 });

  // ── 6. Purchase Orders ────────────────────────────────────────────────────
  console.log('→ Purchase Orders');
  await page.goto(`${BASE}/purchase-orders`, { waitUntil: 'networkidle0' });
  await shot(page, 'purchase-orders.png', { delay: 700 });

  // ── 7. Stock Transfers ────────────────────────────────────────────────────
  console.log('→ Stock Transfers');
  await page.goto(`${BASE}/transfers`, { waitUntil: 'networkidle0' });
  await shot(page, 'stock-transfers.png', { delay: 700 });

  // ── 8. Recalls ────────────────────────────────────────────────────────────
  console.log('→ Recalls');
  await page.goto(`${BASE}/recalls`, { waitUntil: 'networkidle0' });
  await shot(page, 'recalls.png', { delay: 700 });

  // ── 9. Stocktakes ─────────────────────────────────────────────────────────
  console.log('→ Stocktakes');
  await page.goto(`${BASE}/stocktakes`, { waitUntil: 'networkidle0' });
  await shot(page, 'stocktakes.png', { delay: 700 });

  // ── 10. Invoices ──────────────────────────────────────────────────────────
  console.log('→ Invoices');
  await page.goto(`${BASE}/invoices`, { waitUntil: 'networkidle0' });
  await shot(page, 'invoices.png', { delay: 700 });

  // ── 11. Reports ───────────────────────────────────────────────────────────
  console.log('→ Reports');
  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle0' });
  await shot(page, 'reports.png', { waitFor: '.card', delay: 1000 });

  // ── 12. Audit Log ─────────────────────────────────────────────────────────
  console.log('→ Audit Log');
  await page.goto(`${BASE}/audit`, { waitUntil: 'networkidle0' });
  await shot(page, 'audit-log.png', { delay: 700 });

  // ── 13. Users ─────────────────────────────────────────────────────────────
  console.log('→ Users');
  await page.goto(`${BASE}/users`, { waitUntil: 'networkidle0' });
  await shot(page, 'users.png', { delay: 700 });

  // ── 14. Settings ──────────────────────────────────────────────────────────
  console.log('→ Settings');
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  await shot(page, 'settings.png', { waitFor: '.card', delay: 1000 });

  // ── 15. Settings — Email section ──────────────────────────────────────────
  console.log('→ Settings (Email section)');
  await page.evaluate(() => {
    const labels = [...document.querySelectorAll('h3')];
    const emailH = labels.find(h => h.textContent?.includes('Email'));
    if (emailH) emailH.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 400));
  await shot(page, 'settings-email.png');

  // ── 16. Profile ───────────────────────────────────────────────────────────
  console.log('→ Profile');
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle0' });
  await shot(page, 'profile.png', { waitFor: '.card', delay: 700 });

  // ── 17. Returns ───────────────────────────────────────────────────────────
  console.log('→ Returns');
  await page.goto(`${BASE}/returns`, { waitUntil: 'networkidle0' });
  await shot(page, 'returns.png', { delay: 700 });

  // ── Doctor login for order screen ─────────────────────────────────────────
  console.log('→ Switching to Doctor…');
  await login(page, DOCTOR);

  // ── 18. Doctor New Order ──────────────────────────────────────────────────
  console.log('→ Doctor New Order');
  await page.goto(`${BASE}/order`, { waitUntil: 'networkidle0' });
  await shot(page, 'doctor-order.png', { waitFor: '.card', delay: 900 });

  // ── Nurse login for quick charge ──────────────────────────────────────────
  console.log('→ Switching to Nurse…');
  await login(page, NURSE);

  // ── 19. Quick Charge ─────────────────────────────────────────────────────
  console.log('→ Quick Charge');
  await page.goto(`${BASE}/pos`, { waitUntil: 'networkidle0' });
  await shot(page, 'quick-charge.png', { waitFor: '.card', delay: 900 });

  // ── 20. Nurse Requests ───────────────────────────────────────────────────
  console.log('→ Nurse Requests');
  await page.goto(`${BASE}/requests`, { waitUntil: 'networkidle0' });
  await shot(page, 'requests-nurse.png', { delay: 700 });

  const count = fs.readdirSync(OUT).filter(f => f.endsWith('.png')).length;
  console.log(`\n✅  ${count} screenshots saved to docs/screenshots/\n`);

} catch (err) {
  console.error('\n❌  Error:', err.message);
  process.exit(1);
} finally {
  await browser.close();
}
