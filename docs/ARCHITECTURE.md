# MedInventory — Architecture Reference

This document describes the internal design of MedInventory in enough detail for a developer to understand, modify, or extend any part of the system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Request Lifecycle](#request-lifecycle)
3. [Authentication & Authorisation](#authentication--authorisation)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Frontend Architecture](#frontend-architecture)
7. [Stock Safety (Concurrency)](#stock-safety-concurrency)
8. [Notification System](#notification-system)

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

**Single port, nginx proxy** — All traffic enters on port 3000. nginx serves the pre-built React SPA for `GET /*` and proxies `POST|GET|PUT|DELETE /api/*` to the backend container. This means the frontend JavaScript never needs to know the server IP — it uses relative URLs (`/api/inventory`). A browser on any device on the network connects to `http://<server-ip>:3000` and everything works without reconfiguration.

**No ORM** — The backend uses raw `pg` queries. This makes SQL visible and debuggable, avoids N+1 magic, and allows PostgreSQL-specific features (generated columns, `SELECT FOR UPDATE`, sequences).

**PostgreSQL only** — The schema uses UUID primary keys (`gen_random_uuid()`), a `GENERATED ALWAYS AS STORED` column for stocktake variance, `TIMESTAMPTZ` for all timestamps, and sequences for human-readable reference numbers. These are PostgreSQL-specific and intentionally so.

**Token rotation** — Every successful token refresh issues a new refresh token and invalidates the old one. Compromised refresh tokens are detected on the next use.

---

## Request Lifecycle

### A browser request to `GET /api/inventory`

```
1. Browser sends:
   GET /api/inventory
   Authorization: Bearer <access_token>

2. nginx receives on :3000, matches /api/* proxy rule
   → forwards to http://backend:4000/api/inventory

3. Express router matches GET /api/inventory
   → authenticate middleware runs:
      a. Reads Authorization header
      b. Verifies JWT signature against JWT_SECRET
      c. Checks token type === 'access'
      d. Queries users table: SELECT id,email,name,role,is_active
      e. Confirms user is active and not locked
      f. Attaches req.user = { id, email, name, role }
   → route handler runs:
      a. Reads query params (page, limit, search, category, ...)
      b. Builds parameterised SQL with WHERE conditions
      c. Executes COUNT query (for pagination total)
      d. Executes data query with LIMIT/OFFSET
      e. Returns JSON

4. Express sends response → nginx forwards to browser
```

### Token refresh flow

```
1. Access token expires (15 min)
2. Browser makes any API request → receives 401
3. axios interceptor in client.ts catches 401
4. Sends POST /api/auth/refresh with cookie/stored refresh token
5. Backend:
   a. Hashes the provided token
   b. Looks up hash in refresh_tokens table
   c. Checks expiry
   d. Issues new access token + new refresh token
   e. Invalidates old refresh token (DELETE)
6. Interceptor retries the original failed request with new token
7. If refresh also fails → logout + redirect to /login
```

---

## Authentication & Authorisation

### Middleware stack (`backend/src/middleware/auth.ts`)

```typescript
authenticate          // Verifies JWT, attaches req.user — used on all /api routes
requireRole(...roles) // Checks req.user.role is in the allowed list — 403 otherwise
requireAdmin          // Shorthand: requireRole('admin')
requireAdminOrNurse   // Shorthand: requireRole('admin', 'nurse')
requireAnyRole        // Shorthand: requireRole('admin', 'doctor', 'nurse')
```

### Role capability matrix

| Endpoint group | Admin | Doctor | Nurse |
|---|:---:|:---:|:---:|
| `GET /api/inventory` | ✓ | ✓ | ✓ |
| `POST/PUT/DELETE /api/inventory` | ✓ | ✗ | ✗ |
| `GET /api/requests` | ✓ (all) | ✓ (own only) | ✓ (all) |
| `POST /api/requests` | ✓ | ✓ | ✗ |
| `POST /api/requests/quick-charge` | ✓ | ✗ | ✓ |
| `PUT /api/requests/:id/accept` | ✓ | ✗ | ✓ |
| `POST /api/requests/:id/fulfill` | ✓ | ✗ | ✓ |
| `GET /api/stocktakes` | ✓ | ✗ | ✓ |
| `POST /api/stocktakes` | ✓ | ✗ | ✓ |
| `GET /api/invoices` | ✓ | ✗ | ✗ |
| `POST /api/invoices` | ✓ | ✗ | ✗ |
| `GET /api/reports/*` | ✓ | ✓ | ✗ |
| `GET /api/users` | ✓ | ✗ | ✗ |
| `GET /api/audit` | ✓ | ✗ | ✗ |
| `GET /api/system/version` | ✓ | ✓ | ✓ |
| `GET /api/system/status` | ✓ | ✗ | ✗ |

### Account lockout

```sql
-- On failed login:
UPDATE users SET failed_login_attempts = failed_login_attempts + 1
WHERE email = $1

-- If attempts >= MAX_LOGIN_ATTEMPTS:
UPDATE users SET locked_until = NOW() + INTERVAL '15 minutes'

-- On successful login:
UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW()
```

---

## Database Schema

### Entity Relationship Overview

```
users ──────────────────────────────────────────────────────┐
  │                                                         │
  ├─ created_by ──▶ inventory_items ──▶ inventory_batches  │
  │                       │                                 │
  │                       │                                 │
  ├─ doctor_id ──▶ stock_requests ◀── initiated_by ────────┤
  │   initiated_by      │    │                             │
  │                      │    └── stock_request_items      │
  │                      │                                 │
  ├─ nurse_id ──▶ stock_fulfillments ◀── request_id ───────┤
  │                      │
  │                      └── stock_fulfillment_items
  │
  ├─ adjusted_by ──▶ stock_adjustments
  │
  ├─ created_by ──▶ stocktakes
  │                      │
  │                      └── stocktake_items
  │
  ├─ entered_by ──▶ invoices ──▶ invoice_items
  │
  └─ user_id ──▶ audit_log
```

### Tables

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `gen_random_uuid()` |
| email | VARCHAR(255) UNIQUE | Login identifier |
| name | VARCHAR(255) | Display name |
| password_hash | VARCHAR(255) | bcrypt, 12 rounds |
| role | VARCHAR(50) | `admin`, `doctor`, `nurse` |
| is_active | BOOLEAN | Soft delete |
| failed_login_attempts | INTEGER | Incremented on bad login |
| locked_until | TIMESTAMPTZ | NULL if not locked |
| last_login | TIMESTAMPTZ | |
| must_change_password | BOOLEAN | Forces password change on next login |
| created_at / updated_at | TIMESTAMPTZ | `updated_at` maintained by trigger |

#### `refresh_tokens`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | Cascades on delete |
| token_hash | VARCHAR(255) | SHA-256 of the raw token |
| expires_at | TIMESTAMPTZ | Checked on every refresh |

Indexed on `user_id` and `token_hash`.

#### `categories`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) UNIQUE | |
| description | TEXT | |
| color | VARCHAR(7) | Hex colour e.g. `#6366f1` |

#### `suppliers`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name / contact_name | VARCHAR | |
| email / phone / address | VARCHAR / TEXT | |
| is_active | BOOLEAN | Soft archive |

#### `inventory_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | |
| category_id | UUID FK → categories | SET NULL on delete |
| supplier_id | UUID FK → suppliers | SET NULL on delete |
| sku / barcode | VARCHAR | Unique indexes |
| unit | VARCHAR(50) | `unit`, `mL`, `tablet`, etc. |
| quantity_on_hand | DECIMAL(10,3) | Decremented on each fulfilment |
| quantity_reserved | DECIMAL(10,3) | Incremented when request created, released on fulfil/cancel |
| reorder_threshold | DECIMAL(10,3) | Alert when `quantity_on_hand ≤ this` |
| internal_price | DECIMAL(10,4) | Billing price per unit |
| supplier_cost | DECIMAL(10,4) | Purchase cost per unit |
| gst_applicable / gst_rate | BOOLEAN / DECIMAL | Tax handling |
| storage_location | VARCHAR(255) | Free-text location |
| requires_batch_tracking | BOOLEAN | If true, batches must be specified on fulfilment |
| dispense_unit | DECIMAL(10,3) DEFAULT 1 | Step size for +/− buttons in ordering screens |
| is_active | BOOLEAN | Soft archive |

#### `inventory_batches`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| inventory_item_id | UUID FK → inventory_items | Cascades |
| batch_number | VARCHAR(100) | |
| lot_number / expiry_date | VARCHAR / DATE | |
| quantity | DECIMAL(10,3) | Decremented on fulfilment |

#### `stock_requests`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| request_number | VARCHAR(50) UNIQUE | `REQ-001000` or `QC-001000` |
| doctor_id | UUID FK → users | Doctor associated with the request |
| patient_name / patient_ref | VARCHAR | Optional patient information |
| status | VARCHAR(50) | `pending`, `accepted`, `in_progress`, `fulfilled`, `partially_fulfilled`, `cancelled` |
| priority | VARCHAR(20) | `low`, `normal`, `high`, `urgent` |
| is_quick_charge | BOOLEAN DEFAULT false | Set true for nurse-initiated charges |
| initiated_by | UUID FK → users | The nurse who created a quick-charge (NULL for doctor requests) |
| accepted_by / accepted_at | UUID / TIMESTAMPTZ | Nurse who accepted |
| cancelled_by / cancelled_at / cancellation_reason | — | If cancelled |

#### `stock_request_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| request_id | UUID FK → stock_requests | Cascades |
| inventory_item_id | UUID FK → inventory_items | |
| quantity_requested | DECIMAL(10,3) | |

#### `stock_fulfillments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| request_id | UUID FK → stock_requests | |
| nurse_id | UUID FK → users | Nurse who fulfilled |
| fulfillment_number | VARCHAR(50) UNIQUE | `FUL-001000` |
| total_charge | DECIMAL(10,4) | Sum of all line charges |
| completed_at | TIMESTAMPTZ | |

#### `stock_fulfillment_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| fulfillment_id | UUID FK → stock_fulfillments | Cascades |
| request_item_id | UUID FK → stock_request_items | NULL for quick-charge items |
| inventory_item_id | UUID FK → inventory_items | |
| batch_id | UUID FK → inventory_batches | Optional |
| quantity_used | DECIMAL(10,3) | |
| internal_price / total_charge | DECIMAL | Calculated at time of fulfilment |
| is_substitution | BOOLEAN | Different item from what was requested |
| substitution_reason | TEXT | Required when is_substitution = true |

#### `stock_adjustments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| inventory_item_id | UUID FK | |
| adjusted_by | UUID FK → users | |
| adjustment_type | VARCHAR(50) | `increase`, `decrease`, `correction`, `damage`, `expiry`, `return`, `stocktake`, `other` |
| quantity_before / quantity_change / quantity_after | DECIMAL | |
| reason | TEXT | Required |
| reference_type | VARCHAR(50) | `fulfillment`, `quick_charge`, `stocktake`, etc. |

#### `stocktakes`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | |
| type | VARCHAR(50) | `full`, `cycle`, `partial` |
| scope_category_id / scope_location | — | Filters for partial stocktakes |
| status | VARCHAR(50) | `in_progress`, `completed`, `cancelled` |
| total_items / total_variance | INTEGER / DECIMAL | Computed on completion |

#### `stocktake_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| stocktake_id | UUID FK → stocktakes | Cascades |
| inventory_item_id | UUID FK | |
| expected_quantity | DECIMAL | Snapshot of `quantity_on_hand` at session creation |
| counted_quantity | DECIMAL | Entered by staff during the count |
| variance | DECIMAL | **GENERATED ALWAYS AS** `counted_quantity - expected_quantity` STORED |
| adjustment_applied | BOOLEAN | Has the variance been applied as a stock adjustment? |

The `variance` column is a PostgreSQL `GENERATED ALWAYS AS ... STORED` column — the database computes it automatically and it cannot be written to directly.

#### `invoices` and `invoice_items`
Standard supplier invoice model. An invoice is `posted` when its line items have been confirmed and stock levels updated.

#### `audit_log`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id / user_name / user_role | — | Denormalised for permanent record |
| action | VARCHAR(100) | e.g. `INVENTORY_CREATED`, `REQUEST_FULFILLED` |
| entity_type / entity_id / entity_name | VARCHAR | What was affected |
| old_values / new_values | JSONB | Full before/after state |
| ip_address / user_agent | VARCHAR / TEXT | |
| created_at | TIMESTAMPTZ | |

No `updated_at` — audit records are immutable.

### Sequences

```sql
request_number_seq  -- Generates REQ-001000, REQ-001001, ...
fulfillment_number_seq -- Generates FUL-001000, FUL-001001, ...
```

Both start at 1000. Quick-charge requests use the same `request_number_seq` but with the prefix `QC-` instead of `REQ-`.

### Triggers

An `updated_at` trigger fires on every UPDATE for these tables: `users`, `categories`, `suppliers`, `inventory_items`, `inventory_batches`, `stock_requests`, `invoices`.

---

## API Reference

Base URL: `http://<host>:3000/api`

All routes except `POST /auth/login` and `POST /auth/refresh` require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | None | `{ email, password }` → `{ accessToken, user }` + sets refresh token |
| POST | `/auth/refresh` | Refresh token | Issues new access + refresh tokens |
| POST | `/auth/logout` | Access token | Invalidates refresh token |
| GET | `/auth/me` | Access token | Returns current user info |
| PUT | `/auth/change-password` | Access token | `{ currentPassword, newPassword }` |

### Inventory

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/inventory` | Any | List with pagination, search, filters |
| GET | `/inventory/export` | Admin | CSV download of all items |
| POST | `/inventory/import` | Admin | CSV upload |
| GET | `/inventory/:id` | Any | Single item with batches + recent movements |
| POST | `/inventory` | Admin | Create item |
| PUT | `/inventory/:id` | Admin | Update item |
| DELETE | `/inventory/:id` | Admin | Archive item (soft delete) |
| POST | `/inventory/:id/adjust` | Admin | Manual stock adjustment |
| GET | `/inventory/:id/batches` | Any | List batches for an item |

**GET /inventory query parameters:**

| Param | Default | Description |
|---|---|---|
| page | 1 | |
| limit | 50 | Max 200 |
| search | — | Searches name, SKU, barcode, description |
| category | — | UUID of category |
| low_stock | — | `true` to show only below threshold |
| expiring | — | Days ahead (e.g. `30`) |
| active | `true` | `true`, `false`, or `all` |
| sort | `name` | `name`, `sku`, `quantity_on_hand`, `internal_price`, `created_at` |
| order | `asc` | `asc` or `desc` |

### Requests

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/requests` | Any | List requests. Doctors see only their own. Supports `?since=<ISO>` for notification polling |
| GET | `/requests/:id` | Any | Full detail with items + fulfilments |
| POST | `/requests` | Doctor/Admin | Create a new request |
| POST | `/requests/quick-charge` | Nurse/Admin | Create + immediately fulfil in one step |
| PUT | `/requests/:id/accept` | Nurse/Admin | Move to `accepted` status |
| POST | `/requests/:id/fulfill` | Nurse/Admin | Create a fulfilment record |
| PUT | `/requests/:id/cancel` | Doctor/Admin | Cancel with reason |
| GET | `/requests/:id/receipt` | Any | Full receipt with all fulfilments |

**POST /requests body:**
```json
{
  "patient_name": "Jane Smith",
  "patient_ref": "MRN-12345",
  "priority": "normal",
  "notes": "For room 3",
  "items": [
    { "inventory_item_id": "uuid", "quantity_requested": 5 }
  ]
}
```

**POST /requests/quick-charge body:**
```json
{
  "doctor_id": "uuid",
  "patient_name": "Jane Smith",
  "patient_ref": "MRN-12345",
  "notes": null,
  "items": [
    { "inventory_item_id": "uuid", "quantity_used": 2 }
  ]
}
```

### Stocktakes

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/stocktakes` | Admin/Nurse | List sessions |
| POST | `/stocktakes` | Admin/Nurse | Create session (snapshots current stock quantities) |
| GET | `/stocktakes/:id` | Admin/Nurse | Full session with all items. `?format=csv` returns CSV |
| PUT | `/stocktakes/:id/item/:itemId` | Admin/Nurse | Record counted quantity for one item |
| POST | `/stocktakes/:id/complete` | Admin/Nurse | Complete session, optionally apply adjustments |
| PUT | `/stocktakes/:id/cancel` | Admin/Nurse | Cancel session |

### Invoices

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/invoices` | Admin | List with pagination |
| POST | `/invoices` | Admin | Create with line items |
| GET | `/invoices/:id` | Admin | Full detail |
| PUT | `/invoices/:id` | Admin | Update header fields |
| POST | `/invoices/:id/post` | Admin | Post — updates stock levels from line items |
| DELETE | `/invoices/:id` | Admin | Delete if not posted |

### Reports

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/reports/dashboard` | Any | KPI stats for the dashboard |
| GET | `/reports/usage` | Admin/Doctor | Usage by item, with optional `?group_by=nurse&period=week&from=&to=` |
| GET | `/reports/invoices` | Admin | Invoice CSV export |

### Users

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/users` | Admin | List users |
| POST | `/users` | Admin | Create user |
| PUT | `/users/:id` | Admin | Update user (role, active status, force password change) |
| PUT | `/users/:id/reset-password` | Admin | Set a temporary password |

### System

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/health` | None | `{ status: "ok", timestamp }` — used by load balancers |
| GET | `/system/version` | Any | Version from `version.json` |
| GET | `/system/status` | Admin | Version + uptime + DB size + table count + user count |

---

## Frontend Architecture

### State management

All server state is managed by **TanStack Query** (`useQuery`, `useMutation`). Components never hold server data in local state — they read from the query cache and mutate via mutations that invalidate the relevant cache keys on success.

```typescript
// Pattern used throughout:
const { data, isLoading } = useQuery({
  queryKey: ['inventory', filters],   // cache key — changes trigger refetch
  queryFn: () => api.get('/inventory', { params: filters }).then(r => r.data),
  staleTime: 30_000,                   // consider fresh for 30 seconds
});

const mutation = useMutation({
  mutationFn: (id: string) => api.delete(`/inventory/${id}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });  // bust cache
    toast.success('Item deleted');
  },
});
```

### Auth context (`AuthContext.tsx`)

Stores `{ user, accessToken }` in React state and in `sessionStorage`. The axios interceptor in `client.ts` reads the access token from state for every request, and automatically calls `POST /auth/refresh` when a 401 is received.

### Axios client (`api/client.ts`)

- Base URL is empty (`""`) so all requests go to `GET /api/...` relative to the current page origin
- Request interceptor: attaches `Authorization: Bearer <token>`
- Response interceptor: on 401, queues the original request, calls the refresh endpoint, retries with the new token. If refresh fails, calls `logout()` and redirects to `/login`.

### Routing

`App.tsx` uses React Router v6 nested routes. The `ProtectedRoute` component:
1. Shows a spinner while `isLoading` (initial auth check)
2. Redirects to `/login` if no user
3. Redirects to `/` if the user's role is not in the allowed `roles` array
4. Redirects to `/change-password` if `must_change_password` is true

### Component conventions

| Pattern | Example |
|---|---|
| Page components in `pages/` | `Inventory.tsx`, `Reports.tsx` |
| Reusable UI in `components/` | `Modal.tsx`, `Badge.tsx` |
| Custom hooks in `hooks/` | `useIdleTimeout.ts`, `useNotifications.ts` |
| All API types in `types/index.ts` | `InventoryItem`, `StockRequest` |
| Error messages via `getErrorMessage(err)` | Handles Axios + Zod + plain Error |
| Toasts via `react-hot-toast` | `toast.success(...)`, `toast.error(...)` |

---

## Stock Safety (Concurrency)

Every operation that modifies `quantity_on_hand` runs inside a PostgreSQL transaction with row-level locking to prevent race conditions when two nurses fulfil requests simultaneously.

```sql
-- Pattern used in all stock-deducting endpoints:
BEGIN;
  SELECT id, quantity_on_hand FROM inventory_items WHERE id = $1 FOR UPDATE;
  -- ↑ Acquires exclusive lock on this row for the duration of the transaction
  -- Any concurrent transaction trying to lock the same row will wait here

  UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - $2 WHERE id = $1;
  -- Stock deduction is safe — no other transaction can read a stale value

  INSERT INTO stock_adjustments (...) VALUES (...);
  -- Adjustment record created in the same transaction
COMMIT;
-- Lock released
```

The `withTransaction` helper in `db.ts` wraps this pattern:

```typescript
const result = await withTransaction(async (client) => {
  const row = await client.query('SELECT ... FOR UPDATE', [id]);
  await client.query('UPDATE ...', [...]);
  return result;
});
// If any step throws, the transaction is automatically rolled back
```

**Reserved quantity** — when a doctor creates a request, `quantity_reserved` is incremented. This doesn't prevent other requests from being created (it's advisory, not enforced), but it gives nurses and admins visibility into "committed" stock.

---

## Notification System

`useNotifications.ts` runs inside `Layout.tsx` so it's active on every page while logged in.

```
Every 30 seconds:
  GET /api/requests?status=<role-appropriate>&since=<lastSeenTimestamp>

  If response.total > 0:
    1. Play two-tone chime via Web Audio API (synthesised, no file)
    2. Show react-hot-toast with dark coloured background
    3. Advance lastSeenTimestamp to now()

Role logic:
  nurse  → status=pending  (new doctor requests waiting)
  doctor → status=fulfilled (quick-charge receipts from nurses)
  admin  → status=pending   (same as nurse — sees all pending)
```

The `since` query parameter filters requests by `created_at > since`, so only genuinely new records trigger notifications. The first poll after login is suppressed (the `initializedRef` guard) to avoid alerting on existing items.
