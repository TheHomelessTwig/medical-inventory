# S.H.I.T. — Architecture Reference

Internal design of S.H.I.T. in enough detail for a developer to understand, modify, or extend any part of the system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Request Lifecycle](#request-lifecycle)
3. [Authentication & Authorisation](#authentication--authorisation)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Frontend Architecture](#frontend-architecture)
7. [Stock Safety (Concurrency)](#stock-safety-concurrency)
8. [Email System](#email-system)
9. [Notification System](#notification-system)
10. [PWA & Service Worker](#pwa--service-worker)

---

## System Overview

```
                    ┌──────────────────────────────────────────────┐
                    │                Docker Network                 │
                    │                                              │
 Browser ──port 3000──▶ ┌──────────┐                              │
                    │   │  nginx   │                              │
                    │   │ (Alpine) │                              │
                    │   └────┬─────┘                              │
                    │        │ /api/*  → backend:4000             │
                    │        │ /*      → /usr/share/nginx/html    │
                    │        ▼                                     │
                    │   ┌──────────┐      ┌──────────────────┐   │
                    │   │  Node.js │      │   PostgreSQL 16   │   │
                    │   │  Express │─────▶│   medinv_postgres │   │
                    │   │  :4000   │      │   (named volume)  │   │
                    │   └──────────┘      └──────────────────┘   │
                    │                                              │
                    └──────────────────────────────────────────────┘
```

### Key design decisions

- **Single port, nginx proxy** — All traffic enters port 3000. nginx serves the pre-built SPA for `GET /*` and proxies `/api/*` to the backend. The frontend uses relative URLs so it works from any device IP without reconfiguration.
- **No ORM** — Raw `pg` queries. SQL is visible, debuggable, and uses PostgreSQL-specific features.
- **PostgreSQL only** — UUID PKs, `GENERATED ALWAYS AS STORED` columns, sequences for human-readable reference numbers, `SELECT FOR UPDATE` row locking.
- **Token rotation** — Every refresh issues a new refresh token and invalidates the old one. Compromised tokens are detected on next use.

---

## Request Lifecycle

```
1. Browser: GET /api/inventory
   Authorization: Bearer <access_token>

2. nginx → proxies to backend:4000/api/inventory

3. Express → authenticate middleware:
   a. Reads Authorization header
   b. Verifies JWT against JWT_SECRET
   c. Checks token type === 'access'
   d. Queries users table: confirms active, not locked
   e. Attaches req.user = { id, email, name, role }

4. Route handler:
   a. Reads query params
   b. Builds parameterised SQL
   c. Executes queries
   d. Returns JSON

5. If access token is expired (401):
   a. Axios interceptor catches 401
   b. Sends POST /api/auth/refresh
   c. Issues new access + refresh tokens
   d. Retries original request with new token
   e. If refresh also fails → logout + /login
```

### 2FA login flow

```
1. POST /api/auth/login  → credentials valid + totp_enabled=true
   → Returns { requires_totp: true, totp_session: "<2-min JWT>" }

2. Browser shows TOTP input step

3. POST /api/auth/totp/complete { totp_session, code }
   → Verifies TOTP code against stored secret
   → Returns full { accessToken, refreshToken, user }
```

---

## Authentication & Authorisation

### Middleware

```typescript
authenticate          // Verifies JWT, attaches req.user — required on all /api routes
requireRole(...roles) // Checks req.user.role — 403 if not in list
requireAdmin          // Shorthand: requireRole('admin')
requireAdminOrNurse   // Shorthand: requireRole('admin', 'nurse')
```

### Role capability matrix

| Endpoint group | Admin | Doctor | Nurse |
|---|:---:|:---:|:---:|
| `GET /api/inventory` | ✓ | ✓ | ✓ |
| `POST/PUT/DELETE /api/inventory` | ✓ | ✗ | ✗ |
| `PATCH /api/inventory/bulk` | ✓ | ✗ | ✗ |
| `POST /api/inventory/:id/adjust` (wastage) | ✓ | ✗ | ✓ |
| `GET /api/requests` | ✓ all | ✓ own | ✓ all |
| `POST /api/requests` | ✓ | ✓ | ✗ |
| `POST /api/requests/quick-charge` | ✓ | ✗ | ✓ |
| `PUT /api/requests/:id/accept` | ✓ | ✗ | ✓ |
| `POST /api/requests/:id/fulfill` | ✓ | ✗ | ✓ |
| `GET /api/templates` | ✓ own | ✓ own | ✓ own |
| `POST/PUT/DELETE /api/templates` | ✓ | ✓ | ✓ |
| `GET /api/returns` | ✓ | ✗ | ✓ |
| `POST /api/returns` | ✓ | ✗ | ✓ |
| `POST /api/returns/:id/confirm` | ✓ | ✗ | ✗ |
| `GET /api/budgets` | ✓ | ✗ | ✗ |
| `PUT /api/budgets` | ✓ | ✗ | ✗ |
| `GET /api/stocktakes` | ✓ | ✗ | ✓ |
| `GET /api/invoices` | ✓ | ✗ | ✗ |
| `GET /api/invoices/xero-export` | ✓ | ✗ | ✗ |
| `GET /api/reports/*` | ✓ | ✓* | ✗ |
| `GET /api/reports/wastage` | ✓ | ✓ | ✗ |
| `GET /api/users` | ✓ | ✗ | ✗ |
| `GET /api/system/status` | ✓ | ✗ | ✗ |
| `GET /api/auth/totp/setup` | ✓ | ✓ | ✓ |

---

## Database Schema

### All tables

| Table | Purpose |
|---|---|
| `sites` | Clinic locations (multi-site) |
| `users` | Accounts with role, lockout state, TOTP secret, locum expiry |
| `refresh_tokens` | Hashed refresh tokens with expiry |
| `user_sessions` | Active login sessions for revocation |
| `categories` | Item categories with colour |
| `suppliers` | Supplier contact info |
| `inventory_items` | Stock items with prices, thresholds, dispense step, auto-reorder flag, photo |
| `inventory_batches` | Lot/batch tracking with expiry |
| `stock_requests` | Doctor → nurse requests (includes quick-charges) |
| `stock_request_items` | Line items on a request |
| `stock_fulfillments` | Nurse fulfilment records |
| `stock_fulfillment_items` | What was actually dispensed (+ witness fields for controlled drugs) |
| `stock_adjustments` | All stock movements (wastage, corrections, returns, expiry write-offs…) |
| `stock_returns` | Returns to supplier (header) |
| `stock_return_items` | Items on a return |
| `stock_transfers` | Stock transfers between sites (header) |
| `stock_transfer_items` | Line items on a transfer |
| `recalls` | Supplier recall records with affected batch numbers |
| `purchase_orders` | Purchase orders (header) |
| `purchase_order_items` | PO line items with ordered/received quantities |
| `attachments` | File metadata for uploaded files (invoices, returns, POs, item photos) |
| `request_templates` | Saved order/charge baskets (all roles) |
| `stocktakes` | Stocktake sessions |
| `stocktake_items` | Per-item counts with generated variance + optimistic lock version |
| `stocktake_schedules` | Recurring stocktake schedule configuration |
| `invoices` | Supplier invoices |
| `invoice_items` | Invoice line items |
| `budgets` | Monthly spend budgets per category |
| `webhook_subscriptions` | Outbound webhook endpoint registrations |
| `webhook_deliveries` | Delivery log with retry state |
| `system_config` | Single-row: practice branding (name + tagline) |
| `data_retention_config` | Single-row: audit log retain days, anonymisation settings |
| `expiry_alert_config` | Single-row: alert threshold days, email targets |
| `expiry_alert_sent` | Deduplication log for expiry alert emails |
| `audit_log` | Immutable action history |
| `audit_log_archive` | Archived old audit records (moved by nightly retention job) |

### Key columns

#### `users`
| Column | Notes |
|---|---|
| `totp_secret` | Base32 secret for TOTP (NULL if 2FA not set up) |
| `totp_enabled` | Whether 2FA is active for this account |
| `failed_login_attempts` | Incremented on bad password; reset on success |
| `locked_until` | NULL if not locked; set to future time on lockout |

#### `inventory_items`
| Column | Notes |
|---|---|
| `dispense_unit` | Step size for +/− buttons on POS screens (default: 1) |
| `quantity_on_hand` | Live stock level; decremented by transactions with `FOR UPDATE` |
| `quantity_reserved` | Advisory; incremented when request created, released on fulfil/cancel |

#### `stock_requests`
| Column | Notes |
|---|---|
| `is_quick_charge` | `true` for nurse-initiated charges |
| `initiated_by` | Nurse user ID for quick charges (NULL for doctor requests) |
| `request_number` | `REQ-001000` for doctor requests, `QC-001000` for quick charges |

#### `stock_adjustments`
| Column | Notes |
|---|---|
| `adjustment_type` | `increase`, `decrease`, `correction`, `damage`, `expiry`, `return`, `stocktake`, `wastage`, `other` |
| `wastage_reason` | `dropped`, `contaminated`, `opened_unused`, `incorrect_dose`, `expired_opened`, `other` (NULL unless type=wastage) |

#### `stocktake_items`
```sql
variance DECIMAL(10,3) GENERATED ALWAYS AS (
  counted_quantity - expected_quantity
) STORED
```
PostgreSQL computes variance automatically; it cannot be written to directly.

#### `request_templates`
```sql
doctor_id UUID NOT NULL REFERENCES users(id)  -- stores the owning user's ID regardless of role
items JSONB  -- [{ inventory_item_id, item_name, quantity_requested, unit }, ...]
```
Despite the column name, `doctor_id` holds any user's ID — nurses use this table too.

#### `category_budgets`
```sql
period_month DATE  -- always stored as first day of month: 2026-05-01
UNIQUE (category_id, period_month)
```

### Sequences

```sql
request_number_seq    -- REQ-001000, REQ-001001 (doctors) / QC-001000 (quick charges)
fulfillment_number_seq -- FUL-001000, FUL-001001
return_number_seq     -- RET-001000, RET-001001
```

---

## API Reference

Base URL: `http://<host>:3000/api`  
All routes except `POST /auth/login`, `POST /auth/refresh`, and `GET /health` require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Password login. Returns `{ accessToken, refreshToken, user }` or `{ requires_totp: true, totp_session }` |
| POST | `/auth/totp/complete` | Step 2 for 2FA login: `{ totp_session, code }` → full tokens |
| POST | `/auth/refresh` | Issue new tokens |
| POST | `/auth/logout` | Invalidate refresh token |
| GET | `/auth/me` | Current user info |
| PUT | `/auth/profile` | Update own name / email |
| POST | `/auth/change-password` | Change own password |
| GET | `/auth/totp/setup` | Generate TOTP secret + QR code data URL |
| POST | `/auth/totp/verify` | Confirm code → enable 2FA |
| DELETE | `/auth/totp/disable` | Disable 2FA (requires current code) |

### Inventory

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/inventory` | Any | List with pagination, search, filters |
| GET | `/inventory/export` | Admin | CSV download |
| POST | `/inventory/import` | Admin | CSV upload |
| PATCH | `/inventory/bulk` | Admin | Bulk archive/activate/reassign: `{ ids[], action, category_id? }` |
| GET | `/inventory/controlled-register` | Admin | All S8/S4 dispensing events; `?format=csv` |
| GET | `/inventory/:id` | Any | Single item with batches + movements |
| POST | `/inventory` | Admin | Create item |
| PUT | `/inventory/:id` | Admin | Update item |
| DELETE | `/inventory/:id` | Admin | Archive (soft delete) |
| POST | `/inventory/:id/adjust` | Admin/Nurse | Stock adjustment (includes `adjustment_type: 'wastage'` + `wastage_reason`) |
| GET | `/inventory/:id/batches` | Any | List batches sorted by expiry (FEFO order) |
| POST | `/inventory/:id/batches` | Admin/Nurse | Add batch |
| POST | `/inventory/:id/photo` | Admin | Upload primary photo (multipart/form-data, field `photo`) |
| DELETE | `/inventory/:id/photo` | Admin | Remove primary photo |

### Requests

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/requests` | Any | List. Doctors see own only. Supports `?since=<ISO>` for notification polling |
| GET | `/requests/patient-ledger` | Any | `?patient_ref=X` — all charges for a patient |
| GET | `/requests/:id` | Any | Detail with items + fulfilments |
| POST | `/requests` | Doctor/Admin | Create pending request |
| POST | `/requests/quick-charge` | Nurse/Admin | Create + immediately fulfil: `{ doctor_id, patient_name, patient_ref, notes, items[] }` |
| PUT | `/requests/:id/accept` | Nurse/Admin | Move to accepted |
| POST | `/requests/:id/fulfill` | Nurse/Admin | Create fulfilment record |
| PUT | `/requests/:id/cancel` | Doctor/Admin | Cancel with reason |
| GET | `/requests/:id/receipt` | Any | Full receipt with all fulfilments |

### Templates

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/templates` | Any | Caller's own templates |
| POST | `/templates` | Any | Create (or upsert by name) |
| PUT | `/templates/:id` | Any | Update own template |
| DELETE | `/templates/:id` | Any | Delete own template |

Items schema: `[{ inventory_item_id, item_name, quantity_requested, unit }]`

### Returns

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/returns` | Admin/Nurse | List returns |
| GET | `/returns/:id` | Admin/Nurse | Detail with items |
| POST | `/returns` | Admin/Nurse | Create draft |
| PUT | `/returns/:id` | Admin/Nurse | Update draft |
| POST | `/returns/:id/confirm` | Admin | Confirm: restore stock + create adjustment records |
| DELETE | `/returns/:id` | Admin | Delete draft |

### Budgets

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/budgets` | Admin | `?month=YYYY-MM` — spend vs budget per category |
| PUT | `/budgets` | Admin | Upsert: `{ category_id, period_month: "YYYY-MM", budget_amount }` |

### Stocktakes

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/stocktakes` | Admin/Nurse | List sessions |
| POST | `/stocktakes` | Admin/Nurse | Create (snapshots current quantities) |
| GET | `/stocktakes/:id` | Admin/Nurse | Full session. `?format=csv` returns CSV |
| PUT | `/stocktakes/:id/item/:itemId` | Admin/Nurse | Record counted quantity |
| POST | `/stocktakes/:id/complete` | Admin/Nurse | Complete; optionally apply adjustments |
| PUT | `/stocktakes/:id/cancel` | Admin/Nurse | Cancel |

### Invoices

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/invoices` | Admin | List with pagination |
| POST | `/invoices` | Admin | Create with line items |
| GET | `/invoices/:id` | Admin | Full detail |
| PUT | `/invoices/:id` | Admin | Update header |
| POST | `/invoices/:id/post` | Admin | Post: update stock from line items |
| DELETE | `/invoices/:id` | Admin | Delete if unposted |
| GET | `/invoices/xero-export` | Admin | Xero bank transactions CSV (`?from=&to=`) |

### Reports

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/reports/dashboard` | Any | KPI stats |
| GET | `/reports/usage` | Admin/Doctor | Usage by item/nurse/doctor with `?group_by=&period=&from=&to=` |
| GET | `/reports/wastage` | Admin/Doctor | Wastage records with cost; `?format=csv` |
| GET | `/reports/invoices` | Admin | Invoice line items; `?format=csv` |
| GET | `/reports/low-stock` | Any | Items below threshold |
| GET | `/reports/expiring` | Any | Batches expiring within `?days=N` |
| GET | `/reports/valuation` | Admin | Stock value by category |
| GET | `/reports/movements` | Admin | Adjustment history |
| GET | `/reports/bas` | Admin | GST/BAS summary; `?from=&to=&format=csv`; defaults to current AU financial year |

### Dispensing Labels

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/labels/fulfillment/:id` | Any | PDF label sheet for a single fulfilment |
| GET | `/labels/request/:id` | Any | PDF label sheet for all fulfilments on a request |

### Stock Transfers

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/transfers` | Admin/Nurse/Manager | List transfers |
| GET | `/transfers/:id` | Admin/Nurse/Manager | Detail with items |
| POST | `/transfers` | Admin/Nurse/Manager | Create draft |
| PUT | `/transfers/:id` | Admin/Nurse/Manager | Update draft |
| POST | `/transfers/:id/dispatch` | Admin/Nurse/Manager | Mark in_transit; deducts source stock |
| POST | `/transfers/:id/receive` | Admin/Nurse/Manager | Mark received; adds destination stock |
| DELETE | `/transfers/:id` | Admin/Nurse/Manager | Cancel draft |

### Recalls

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/recalls` | Admin/Manager | List recalls |
| GET | `/recalls/:id` | Admin/Manager | Detail with affected batches + patient dispensing list |
| POST | `/recalls` | Admin/Manager | Create recall (emails admins; fires webhook) |
| PUT | `/recalls/:id` | Admin/Manager | Update recall |
| POST | `/recalls/:id/quarantine` | Admin/Manager | Write off all affected batches |
| POST | `/recalls/:id/close` | Admin/Manager | Close recall |
| GET | `/recalls/:id/export` | Admin/Manager | CSV of affected dispensing events |

### Webhooks

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/webhooks/events` | Admin | List all available event type strings |
| GET | `/webhooks` | Admin | List subscriptions (secret never returned) |
| POST | `/webhooks` | Admin | Create subscription; secret returned once |
| PUT | `/webhooks/:id` | Admin | Update subscription |
| DELETE | `/webhooks/:id` | Admin | Delete subscription |
| GET | `/webhooks/:id/deliveries` | Admin | Last 100 delivery records |
| POST | `/webhooks/:id/test` | Admin | Send a test ping; returns `{ response_code, success }` |

### Stocktake Schedules

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/stocktake-schedules` | Admin/Manager | List schedules |
| POST | `/stocktake-schedules` | Admin/Manager | Create schedule |
| PUT | `/stocktake-schedules/:id` | Admin/Manager | Update schedule |
| DELETE | `/stocktake-schedules/:id` | Admin/Manager | Delete schedule |

### System

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/health` | None | `{ status: "ok", timestamp }` |
| GET | `/system/version` | Any | Version from version.json |
| GET | `/system/status` | Admin | Version + uptime + DB size + user count |
| GET | `/system/branding` | None | `{ practice_name, practice_tagline }` (public — used on login) |
| PUT | `/system/branding` | Admin | Update practice name/tagline |

---

## Frontend Architecture

### State management

All server state via **TanStack Query**. Components never hold server data in local state.

```typescript
const { data, isLoading } = useQuery({
  queryKey: ['inventory', filters],
  queryFn: () => api.get('/inventory', { params: filters }).then(r => r.data),
  staleTime: 30_000,
});

const mutation = useMutation({
  mutationFn: (id) => api.delete(`/inventory/${id}`),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory'] }),
});
```

### Context providers (in mount order)

```
ThemeProvider       ← dark mode, accent colour, notification sound (localStorage)
  AuthProvider      ← user state, accessToken, login/logout
    App             ← router, pages
```

### Key hooks

| Hook | Purpose |
|---|---|
| `useAuth()` | Access user, login, logout, refreshUser |
| `useTheme()` | Dark mode toggle, accent colour, notification sound toggle |
| `useBarcodeScan({ onScan })` | Detects USB scanner input; calls onScan(code) |
| `useKeyboardShortcuts(map)` | /, N, Esc, ? shortcuts; skips when typing |
| `useIdleTimeout(...)` | 28-min warning, 30-min auto-logout |
| `useNotifications()` | Polls /api/requests every 30s; plays Web Audio chime |
| `useDebounce(value, ms)` | Debounces search input for inventory page |

### Barcode scanner detection

`useBarcodeScan` listens on `keydown` globally. It buffers keystrokes and fires `onScan(code)` when:
- An `Enter` key is received after ≥3 buffered characters
- The inter-keystroke gap is < 50ms (scanner speed vs human typing speed)
- The current focus is not inside an `<input>`, `<textarea>`, or `<select>`

### ThemeContext and CSS variables

`ThemeContext` manages three things:

1. **Dark mode** — adds/removes `class="dark"` on `<html>`. Tailwind's `dark:` variants apply automatically.
2. **Accent colour** — sets CSS custom properties:
   ```css
   --accent: #2563eb;
   --accent-dark: #1d4ed8;
   --accent-ring: #93c5fd;
   ```
   `.btn-primary` and sidebar active nav items use `background-color: var(--accent)`.
3. **Notification sound** — boolean read by `useNotifications` to decide whether to play the Web Audio chime.

All preferences persist in `localStorage` under keys prefixed with `shit-`.

---

## Stock Safety (Concurrency)

Every stock-deducting operation uses `SELECT FOR UPDATE` inside a `withTransaction()` call:

```sql
BEGIN;
  SELECT id, quantity_on_hand FROM inventory_items
  WHERE id = $1 FOR UPDATE;   -- exclusive row lock

  UPDATE inventory_items
  SET quantity_on_hand = quantity_on_hand - $2
  WHERE id = $1;

  INSERT INTO stock_adjustments (...) VALUES (...);
COMMIT;
-- Lock released; next waiter proceeds with fresh data
```

This prevents two nurses from fulfilling the same request simultaneously and ending up with negative stock.

Returns use the same pattern: `SELECT ... FOR UPDATE` before restoring quantities.

---

## Email System

`backend/src/utils/email.ts` wraps nodemailer with a simple typed API.

### Configuration

If `SMTP_HOST` is not set in `.env`, all email functions are silent no-ops — the app works fine without email configured.

### Transport

```typescript
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false },
});
```

### Typed send functions

| Function | When called |
|---|---|
| `emailNewRequest(...)` | After `POST /api/requests` — notifies nurses |
| `emailRequestFulfilled(...)` | After `POST /api/requests/:id/fulfill` — notifies doctor |
| `emailQuickCharge(...)` | After `POST /api/requests/quick-charge` — notifies doctor |
| `emailAccountLocked(...)` | When lockout threshold is reached in login route |
| `emailAfterHoursLogin(...)` | When login hour < 7 or >= 20 (server local time) |
| `emailWeeklyReport(...)` | Called by scheduled job every Monday 8am |

All functions catch errors and log them — email failures **never throw** into the request handler.

### Scheduled reports (`backend/src/jobs/scheduledReports.ts`)

Started in `index.ts` (not in test environment):

```typescript
cron.schedule('0 8 * * 1', runWeeklyReport, {
  timezone: process.env.REPORT_TIMEZONE || 'UTC',
});
```

Queries: usage totals for last week + items below reorder threshold → calls `emailWeeklyReport`.

---

## Notification System

`useNotifications.ts` runs inside `Layout.tsx` and polls every 30 seconds.

```
Role: nurse   → GET /api/requests?status=pending&since=<lastSeen>
Role: doctor  → GET /api/requests?status=fulfilled&since=<lastSeen>
Role: admin   → GET /api/requests?status=pending&since=<lastSeen>

If response.total > 0 AND notificationSound is enabled:
  1. Play two-tone chime via Web Audio API (synthesised, no file)
  2. Show react-hot-toast with coloured background
  3. Advance lastSeen to now
```

The `since` query param filters `WHERE sr.created_at > $1` — only genuinely new records trigger notifications. The first poll after login is suppressed (initialisation guard) to avoid alerting on pre-existing items.

---

## PWA & Service Worker

`vite-plugin-pwa` generates a Workbox service worker at build time.

### Caching strategy

| URL pattern | Strategy | Rationale |
|---|---|---|
| `/api/*` | NetworkFirst (10s timeout) | Data must be fresh; fall back to cache if offline |
| Static assets (`*.js`, `*.css`, `*.png`) | CacheFirst (precached) | Content-hashed filenames change on each deploy |
| HTML navigation | NetworkFirst | Always fetch fresh shell; serve cached on offline |

### Manifest shortcuts

The `manifest.json` includes app shortcuts visible when long-pressing the home screen icon:
- **Quick Charge** → `/pos`
- **New Order** → `/order`

### Install prompt

The PWA is installable on:
- Chrome/Edge desktop: address bar install icon
- Android Chrome: "Add to Home Screen" in menu
- iOS Safari: share button → "Add to Home Screen"

The app runs in `display: standalone` mode (no browser chrome) once installed.

---

## Database Migration System

`backend/src/db/migrate.ts` runs automatically on every app startup before the HTTP server accepts traffic.

### How it works

```
1. Connect to database
2. CREATE TABLE IF NOT EXISTS schema_migrations(version, applied_at)
3. Check if users table exists (existing install) and schema_migrations is empty
   → If yes: stamp ALL migration files as applied without running them
     (the schema is already in place from docker-entrypoint-initdb.d)
4. For each *.sql file in src/db/migrations/ (sorted ascending):
   → Skip if already stamped in schema_migrations
   → Run the SQL (idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
   → INSERT into schema_migrations
5. COMMIT
```

### Migration files

All files in `backend/src/db/migrations/` are idempotent — safe to run on an existing schema. New columns use `ADD COLUMN IF NOT EXISTS`, new tables use `CREATE TABLE IF NOT EXISTS`, constraint changes use `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`.

| File | Description |
|---|---|
| `0001_wastage.sql` | Add `wastage` to adjustment_type CHECK; `wastage_reason` column |
| `0002_totp.sql` | Add `totp_secret`, `totp_enabled` to users |
| `0003_request_templates.sql` | Create `request_templates` table |
| `0004_returns.sql` | Create `stock_returns`, `stock_return_items`, sequence |
| `0005_budgets.sql` | Create `budgets` table |
| `0006_user_sessions.sql` | Create `user_sessions` table for session revocation |
| `0007_controlled_drugs.sql` | Add `is_controlled`, `controlled_schedule` on items; witness columns on fulfilments |
| `0008_purchase_orders.sql` | Create `purchase_orders`, `purchase_order_items`, sequence |
| `0009_attachments.sql` | Create `attachments` table |
| `0010_sites.sql` | Create `sites`; add `site_id` to users, inventory_items, requests, adjustments |
| `0011_roles.sql` | Update role CHECK to include `practice_manager`, `receptionist`, `locum_doctor`; add `locum_expires_at` |
| `0012_stocktake_locking.sql` | Add `version` column for optimistic locking |
| `0013_data_retention.sql` | Create `data_retention_config`, `audit_log_archive` |
| `0014_expiry_alerts.sql` | Create `expiry_alert_config`, `expiry_alert_sent` |

---

## Role System (Extended)

### Roles

| Role | Description |
|---|---|
| `admin` | Full access to everything |
| `doctor` | Place orders, view own requests and reports, 2FA |
| `locum_doctor` | Same as doctor, with optional `locum_expires_at` expiry |
| `nurse` | Fulfill requests, quick charge, stocktakes, returns, wastage |
| `practice_manager` | Reports, invoices, purchase orders, users, settings; no dispensing |
| `receptionist` | Read-only inventory and patient ledger only |

### Locum expiry

The `authenticate` middleware checks `locum_expires_at` for `locum_doctor` accounts. If the timestamp is in the past, the API returns `403 Locum access has expired` and the user must re-authenticate after an admin extends their access.

### Middleware helpers

```typescript
requireAdmin            // admin only
requireAdminOrNurse     // admin | nurse
requireAdminOrManager   // admin | practice_manager
requireClinicalAccess   // all roles (alias: requireAnyRole)
```

---

## Session Management

### user_sessions table

Each login creates a `user_sessions` record with a `token_family` UUID that ties the access + refresh token pair together. The record tracks:
- `ip_address`, `user_agent` — for the session list UI
- `last_seen_at` — updated on each token refresh
- `revoked`, `revoked_at`, `revoked_by` — for forced logout

### Revocation endpoints

```
GET    /api/auth/sessions             — list own active sessions
DELETE /api/auth/sessions/:id         — revoke one session
DELETE /api/auth/sessions             — revoke all own sessions (log out everywhere)
GET    /api/auth/sessions/user/:id    — admin: view user's sessions
DELETE /api/auth/sessions/user/:id    — admin: revoke all sessions for a user
```

### Effect of deactivating a user

`DELETE /api/users/:id` sets `is_active = false`. The `authenticate` middleware checks this on every request — the user is blocked within 15 minutes (the access token lifetime) or immediately on next token refresh. An admin can also call `DELETE /api/auth/sessions/user/:id` to revoke refresh tokens immediately.

---

## Controlled Drug Register

### Schema

```sql
-- inventory_items
is_controlled       BOOLEAN DEFAULT false
controlled_schedule VARCHAR(10)  -- 'S4', 'S8', 'S4D', etc.

-- stock_fulfillment_items
witness_name  VARCHAR(255)  -- required for S8 dispensing
witness_role  VARCHAR(100)
```

### Controlled Drug Register export

```
GET /api/inventory/controlled-register
Query params: from, to, item_id, format=csv
```

Returns all dispensing events where `inventory_items.is_controlled = true`, including witness details. Use `?format=csv` for the downloadable CSV for regulatory compliance.

---

## Purchase Order Workflow

```
draft → sent → partial → received
             ↘ cancelled
```

| Step | Endpoint | Effect |
|---|---|---|
| Create | `POST /api/purchase-orders` | Status: draft; generates PO-NNNNNN number |
| Edit | `PUT /api/purchase-orders/:id` | Draft only |
| Send | `POST /api/purchase-orders/:id/send` | Status: sent; emails supplier if they have an email |
| Receive | `POST /api/purchase-orders/:id/receive` | Updates `quantity_on_hand` + creates batches + stock adjustment records |
| Cancel | `DELETE /api/purchase-orders/:id` | Draft or sent only |

Partial receipt (some items received): status becomes `partial`. Further receipts add to `quantity_received`. When all lines are fully received, status becomes `received`.

---

## File Attachments

Files are stored on the **uploads Docker volume** (`/uploads` inside the container, mapped to `uploads_data` named volume). The DB stores only metadata.

```
POST /api/attachments/:entityType/:entityId  → multipart/form-data, field "file"
GET  /api/attachments/:entityType/:entityId  → list for entity
GET  /api/attachments/file/:id               → stream download
DELETE /api/attachments/:id                  → admin/manager only
```

**Allowed entity types:** `invoice`, `return`, `purchase_order`  
**Allowed MIME types:** PDF, JPEG, PNG, WebP, CSV, XLSX  
**Max size:** 20 MB per file, 5 files per upload request

The `stored_name` is a UUID-based filename (`<uuid>.pdf`) that prevents path traversal and filename collisions.

---

## Multi-Site Support

The `sites` table provides a flat namespace. Every `user`, `inventory_item`, `stock_request`, and `stock_adjustment` has an optional `site_id` FK.

A default site (`id = 00000000-0000-0000-0000-000000000001`, name = "Main Clinic") is inserted on migration so existing rows remain valid.

Site-scoped queries filter with `WHERE site_id = $1` or `WHERE site_id IS NULL` (shared across all sites). The API for sites:

```
GET    /api/sites         — all sites with user/item counts
POST   /api/sites         — create (admin)
PUT    /api/sites/:id     — update (admin)
DELETE /api/sites/:id     — deactivate (admin; default site protected)
```

---

## Data Retention & Archiving

### Configuration

```sql
data_retention_config (single row, id=1):
  audit_log_retain_days    -- default 2555 (7 years)
  patient_data_retain_days -- default 2555
  anonymise_patient_refs   -- default false
```

### Nightly retention job (`backend/src/jobs/retentionJob.ts`)

Runs daily at 03:00 in the configured timezone:
1. Copies audit_log rows older than `audit_log_retain_days` → `audit_log_archive`
2. Deletes those rows from `audit_log` (keeps the live table fast)
3. If `anonymise_patient_refs = true`: sets `patient_name = '[Anonymised]'` and `patient_ref = '[Anonymised]'` on stock_requests older than `patient_data_retain_days`

### DB size monitoring

```
GET /api/retention/db-size   — table sizes, row estimates, audit log counts
```

Returns `pg_statio_user_tables` data sorted by total size, plus live/archive audit counts. Use this to decide when to add table partitioning.

### Typical DB size

| Period | Relational data | With attachments |
|---|---|---|
| 1 year (busy clinic) | ~100 MB | ~500 MB |
| 5 years (no archiving) | ~650 MB | 1–3 GB |
| 5 years (with nightly archiving) | ~150 MB live | ~250 MB live |

The audit_log_archive table is append-only and grows indefinitely — it should be backed up and optionally partitioned with `pg_partman` for very large installations (>5M rows).

---

## Scheduled Jobs Summary

All jobs started in `index.ts` (non-test environments):

| Job | Schedule | File |
|---|---|---|
| Weekly usage + low-stock email | Monday 08:00 | `scheduledReports.ts` |
| Daily expiry alerts | Daily 08:00 | `scheduledReports.ts` |
| Weekly backup integrity check | Sunday 04:00 | `scheduledReports.ts` |
| Nightly expired-batch write-off | Daily 01:00 | `expiryWriteoff.ts` |
| Nightly data retention | Daily 03:00 | `retentionJob.ts` |
| Scheduled stocktake creation | Daily 07:00 | `stocktakeScheduler.ts` |
| Webhook retry queue | Every 2 minutes | `webhookRetry.ts` |

### Expiry alert deduplication

The `expiry_alert_sent` table tracks which `(batch_id, days_out)` pairs have already been alerted. A row is inserted before the email is sent, so if the cron runs twice (e.g. after a restart) or a batch is still expiring at the same threshold next day, no duplicate email is sent.

### Backup integrity check

The weekly check (Sunday 04:00):
1. Finds the most recent `*.sql.gz` file in `BACKUP_DIR`
2. Creates a temporary database, restores the backup, counts `inventory_items` rows
3. Drops the temp database
4. Emails admins: ✅ passed (with row count) or ⚠️ failed (with file name)
5. If no backup files found: sends an alert

---

## Stocktake Optimistic Locking

`stocktake_items` has a `version INTEGER DEFAULT 0` column. When updating a count:

```typescript
// Client sends: { counted_quantity, version: <current_version> }

UPDATE stocktake_items
SET counted_quantity = $1, version = version + 1
WHERE id = $2 AND version = $3   -- optimistic lock check
RETURNING *
```

If the row has been updated since the client read it (version mismatch), the UPDATE affects 0 rows and the API returns `409 Conflict: this item was updated by someone else. Please reload and try again.`

Version is optional in the request — if omitted, the update is applied unconditionally (backwards compatible).

---

## Offline Dispensing Queue (PWA)

The service worker uses Workbox Background Sync to queue POST mutations when offline:

| Queue | URL pattern | Retention |
|---|---|---|
| `fulfil-queue` | `/api/requests/*/fulfill` | 24 hours |
| `quick-charge-queue` | `/api/requests/quick-charge` | 24 hours |

When connectivity is restored, the service worker automatically replays the queued requests in order. If a request fails after replay, it stays in the queue until the 24-hour TTL expires.

**Note:** Queued mutations use the access token that was current when the request was made. If the token expires while offline (15-minute TTL), the replay will receive a 401 and fail. For extended offline use, a longer `JWT_EXPIRES_IN` value (e.g. `2h`) is recommended.

---

## Recall Management

### Schema

```sql
recalls (
  id, recall_number,
  title, description,
  supplier_id, supplier_name,
  batch_numbers TEXT[],   -- affected batch numbers to match against inventory_batches
  item_ids      UUID[],   -- affected item IDs (optional second filter)
  severity      CHECK('low','moderate','high','critical'),
  status        CHECK('active','quarantined','disposed','closed'),
  regulatory_ref, action_required,
  created_by, closed_by, closed_at
)
```

### Patient impact query

When viewing a recall, the API cross-references `stock_fulfillment_items.batch_number` against `recalls.batch_numbers` to produce the full list of patients who received affected stock:

```sql
SELECT sr.patient_name, sr.patient_ref, sf.completed_at, ...
FROM stock_fulfillment_items sfi
JOIN stock_fulfillments sf ON sfi.fulfillment_id = sf.id
JOIN stock_requests sr     ON sf.request_id = sr.id
WHERE sfi.batch_number = ANY($1::text[])
```

This uses PostgreSQL's native `ANY()` array operator — no application-side filtering.

### Quarantine

`POST /api/recalls/:id/quarantine` runs inside a `withTransaction()` call:
1. Finds all batches matching the recall's batch numbers with `quantity > 0`
2. For each: zeroes the batch, deducts from `inventory_items.quantity_on_hand`, creates a `'decrease'` adjustment with `reference_type = 'recall'`

---

## Dispensing Labels (PDF)

`backend/src/utils/pdfLabels.ts` uses `pdfkit` to build an A4 PDF with a 2×5 grid of labels (Avery L7163 / 99×57mm compatible).

### Layout

```
┌─────────────────────────────────┐ ┌─────────────────────────────────┐
│ S.H.I.T.                        │ │ S.H.I.T.                        │
│                                 │ │                                 │
│ Amoxicillin 500mg               │ │ Paracetamol 500mg               │
│ Qty: 2 tablet                   │ │ Qty: 4 tablet                   │
│ Patient: Jane Smith (PT-001)    │ │ Patient: John Doe (PT-002)      │
│ Batch: LOT2024A   Exp: 2026-06  │ │ Batch: LOT2024B   Exp: 2025-12  │
│ Dispensed: 2026-05-08 by S.Jones│ │ Dispensed: 2026-05-08 by S.Jones│
│ Dr: Dr Smith                    │ │ Dr: Dr Smith                    │
└─────────────────────────────────┘ └─────────────────────────────────┘
```

One `LabelData` object per dispensed line item. A single fulfilment with 5 line items produces 5 labels across 3 rows of an A4 sheet.

---

## Stock Transfers

### Workflow

```
draft → in_transit → received
      ↘ cancelled
```

**Dispatch** (`POST /api/transfers/:id/dispatch`):
- Deducts `quantity_sent` from `inventory_items.quantity_on_hand` at the source
- Creates a `'decrease'` adjustment with `reference_type = 'transfer'`
- Updates status to `in_transit`

**Receive** (`POST /api/transfers/:id/receive`):
- Adds `quantity_sent` to `inventory_items.quantity_on_hand` at the destination
- Creates an `'increase'` adjustment
- Updates status to `received`

Both steps run inside `withTransaction()` for atomicity.

---

## Auto Reorder

`backend/src/utils/autoReorder.ts` is called inside the fulfillment transaction after each stock deduction. It is a no-op if:
- `auto_reorder = false` on the item, **or**
- The item has no `supplier_id`, **or**
- `quantity_on_hand > reorder_threshold`, **or**
- A draft/sent PO for this `(supplier_id, inventory_item_id)` already exists

When it fires, it creates a draft `purchase_orders` record using `nextval('po_number_seq')` and emits a `stock.low` webhook event via `setImmediate()` (outside the transaction, best-effort).

---

## Automatic Expiry Write-off

`backend/src/jobs/expiryWriteoff.ts` runs nightly at 01:00:

```sql
SELECT b.id, b.inventory_item_id, b.quantity, ...
FROM inventory_batches b
JOIN inventory_items i ON b.inventory_item_id = i.id
WHERE b.expiry_date < CURRENT_DATE
  AND b.quantity > 0
  AND b.is_active = true
```

For each expired batch inside a `withTransaction()`:
1. `UPDATE inventory_batches SET quantity = 0`
2. `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - qty`
3. `INSERT INTO stock_adjustments (adjustment_type='expiry', ...)`

After the transaction: sends summary email to admins, fires `stock.expired` webhook.

---

## Scheduled Stocktakes

`stocktake_schedules` stores configuration. `stocktakeScheduler.ts` runs daily at 07:00 and queries:

```sql
SELECT * FROM stocktake_schedules
WHERE is_active = true AND next_due_at <= NOW()
```

For each due schedule:
1. Determines the item set (full / partial by category or location)
2. Creates a `stocktakes` row + snapshots `quantity_on_hand` for each item into `stocktake_items`
3. Updates `next_due_at` by adding the frequency period
4. Emails nursing staff and any `notify_emails` addresses

`next_due_at` is computed from `frequency` + `day_of_period`:
- **Weekly**: next occurrence of the specified weekday (1=Mon…7=Sun)
- **Monthly / Quarterly**: next occurrence of `day_of_period` (1-28) in the next month/quarter

---

## GST / BAS Report

`GET /api/reports/bas` calculates three things from the database:

**Taxable purchases** (from `invoices` + `invoice_items`):
```sql
SUM(CASE WHEN gst_applicable THEN total_cost - gst_amount ELSE total_cost END) AS subtotal
SUM(CASE WHEN gst_applicable THEN gst_amount ELSE 0 END) AS gst_credits
WHERE invoices.status = 'posted' AND posted_at BETWEEN $from AND $to
```

**Taxable supplies** (from `stock_fulfillment_items`):
```sql
SUM(CASE WHEN gst_applicable THEN total_charge / 1.1 ELSE total_charge END) AS excl_gst
SUM(CASE WHEN gst_applicable THEN total_charge - total_charge / 1.1 ELSE 0 END) AS gst_collected
WHERE sf.completed_at BETWEEN $from AND $to AND total_charge > 0
```

**Net GST payable** = `gst_collected − gst_credits`

The monthly breakdown is a `GROUP BY TO_CHAR(posted_at, 'YYYY-MM')` query over the same period.

---

## Error Boundaries

`ErrorBoundary` (a React class component) wraps each major page route in `App.tsx`:

```tsx
<Route path="inventory" element={
  <ErrorBoundary context="Inventory"><Inventory /></ErrorBoundary>
} />
```

If a page component throws an unhandled error during render, the boundary catches it and shows a "Something went wrong / Try again / Reload page" card instead of a blank screen. The full error and component stack are logged to the browser console and (in Docker) to the container stdout log.
