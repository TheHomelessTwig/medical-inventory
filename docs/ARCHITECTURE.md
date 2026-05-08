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
| `users` | Accounts with role, lockout state, TOTP secret |
| `refresh_tokens` | Hashed refresh tokens with expiry |
| `categories` | Item categories with colour |
| `suppliers` | Supplier contact info |
| `inventory_items` | Stock items with prices, thresholds, dispense step |
| `inventory_batches` | Lot/batch tracking with expiry |
| `stock_requests` | Doctor → nurse requests (includes quick-charges) |
| `stock_request_items` | Line items on a request |
| `stock_fulfillments` | Nurse fulfilment records |
| `stock_fulfillment_items` | What was actually dispensed |
| `stock_adjustments` | All stock movements (wastage, corrections, returns…) |
| `stock_returns` | Returns to supplier (header) |
| `stock_return_items` | Items on a return |
| `request_templates` | Saved order/charge baskets (all roles) |
| `stocktakes` | Stocktake sessions |
| `stocktake_items` | Per-item counts with generated variance |
| `invoices` | Supplier invoices |
| `invoice_items` | Invoice line items |
| `category_budgets` | Monthly spend budgets per category |
| `audit_log` | Immutable action history |

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
| GET | `/inventory/:id` | Any | Single item with batches + movements |
| POST | `/inventory` | Admin | Create item |
| PUT | `/inventory/:id` | Admin | Update item |
| DELETE | `/inventory/:id` | Admin | Archive (soft delete) |
| POST | `/inventory/:id/adjust` | Admin/Nurse | Stock adjustment (includes `adjustment_type: 'wastage'` + `wastage_reason`) |
| GET | `/inventory/:id/batches` | Any | List batches sorted by expiry (FEFO order) |
| POST | `/inventory/:id/batches` | Admin/Nurse | Add batch |

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

### System

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/health` | None | `{ status: "ok", timestamp }` |
| GET | `/system/version` | Any | Version from version.json |
| GET | `/system/status` | Admin | Version + uptime + DB size + user count |

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
