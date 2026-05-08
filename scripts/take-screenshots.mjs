/**
 * Automated screenshot script for S.H.I.T. documentation.
 * Run from the project root: node scripts/take-screenshots.mjs
 */

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const BASE = 'http://localhost:3000';
const OUT  = resolve('docs/screenshots');
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]',    'admin@clinic.local');
  await page.type('input[type="password"]', 'Admin123!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
}

async function shot(page, name, path, { wait = 1000, fullPage = false } = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, wait));
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage });
  console.log(`  ✓  ${name}.png`);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    // ── Login page (before auth) ──────────────────────────────────────────
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: `${OUT}/login.png` });
    console.log('  ✓  login.png');

    // ── Log in ────────────────────────────────────────────────────────────
    await login(page);

    // ── Authenticated pages ───────────────────────────────────────────────
    await shot(page, 'dashboard',      '/',            { wait: 1200, fullPage: true });
    await shot(page, 'inventory',      '/inventory',   { wait: 800,  fullPage: true });
    await shot(page, 'doctor-order',   '/order',       { wait: 800,  fullPage: false });
    await shot(page, 'quick-charge',   '/pos',         { wait: 800,  fullPage: false });
    await shot(page, 'requests',       '/requests',    { wait: 800,  fullPage: true });
    await shot(page, 'stocktakes',     '/stocktakes',  { wait: 800,  fullPage: true });
    await shot(page, 'invoices',       '/invoices',    { wait: 800,  fullPage: true });
    await shot(page, 'reports',        '/reports',     { wait: 1200, fullPage: true });
    await shot(page, 'settings',       '/settings',    { wait: 800,  fullPage: true });
    await shot(page, 'profile',        '/profile',     { wait: 800,  fullPage: true });
    await shot(page, 'audit-log',      '/audit',       { wait: 800,  fullPage: true });

    // ── Dark mode ─────────────────────────────────────────────────────────
    // Enable dark mode via localStorage then reload
    await page.evaluate(() => {
      localStorage.setItem('shit-theme-mode', 'dark');
      document.documentElement.classList.add('dark');
    });
    await shot(page, 'dashboard-dark', '/', { wait: 1200, fullPage: false });

    console.log(`\n  All screenshots saved to docs/screenshots/\n`);
  } finally {
    await browser.close();
  }
})();
