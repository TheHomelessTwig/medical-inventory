# MedInventory — System Architecture & Documentation

## Overview

A self-contained, open-source inventory management system for medical practices. Runs entirely on your own infrastructure using Docker.

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + TypeScript + Vite | SPA UI |
| Styling | Tailwind CSS + @tailwindcss/forms | Responsive design |
| State | TanStack Query v5 | Server state & caching |
| Forms | React Hook Form + Zod | Form validation |
| Charts | Recharts | Dashboard & reports |
| Routing | React Router v6 | Client-side routing |
| Backend | Node.js + Express + TypeScript | REST API |
| Database | PostgreSQL 16 | Persistent storage |
| Auth | JWT (access + refresh tokens) | Authentication |
| Passwords | bcryptjs (12 rounds) | Password hashing |
| Validation | Zod | Request validation |
| Security | helmet, express-rate-limit, CORS | Hardening |
| Container | Docker + Docker Compose | Deployment |
| Web Server | nginx (alpine) | Frontend serving |

All dependencies are **free and open-source**. Zero paid APIs, zero vendor lock-in.

---

## Architecture

```
┌─────────────────────────────────────────┐
│         Docker Compose                  │
│                                         │
│  ┌──────────┐   ┌──────────┐            │
│  │ Frontend │   │ Backend  │            │
│  │  :3000   │──▶│  :4000   │            │
│  │  nginx   │   │ Express  │            │
│  └──────────┘   └────┬─────┘            │
│                      │                  │
│               ┌──────▼──────┐           │
│               │  PostgreSQL │           │
│               │    :5432    │           │
│               └─────────────┘           │
└─────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `users` | Staff accounts with role-based access |
| `refresh_tokens` | JWT refresh token storage |
| `categories` | Item categories |
| `suppliers` | Supplier directory |
| `inventory_items` | Master stock list |
| `inventory_batches` | Batch/lot tracking per item |
| `stock_requests` | Doctor → nurse request workflow |
| `stock_request_items` | Line items in a request |
| `stock_fulfillments` | Nurse completion records |
| `stock_fulfillment_items` | Actual items used (billing receipt) |
| `stock_adjustments` | Manual stock adjustments |
| `stocktakes` | Stocktake sessions |
| `stocktake_items` | Expected vs actual counts |
| `invoices` | Supplier invoices |
| `invoice_items` | Invoice line items |
| `audit_log` | Immutable audit trail |

### Key Design Decisions

- **UUIDs** as primary keys (no sequential enumeration)
- **Transactional stock operations** — all deductions/additions use `BEGIN/COMMIT`
- **Row-level locking** (`SELECT FOR UPDATE`) prevents race conditions
- **Generated columns** — `stocktake_items.variance` computed by DB
- **Soft deletes** — items archived, never deleted
- **Immutable audit log** — no UPDATE/DELETE on audit_log table

---

## API Design

Base URL: `http://your-server:4000/api`

### Authentication
```
POST /auth/login          → { accessToken, refreshToken, user }
POST /auth/refresh        → { accessToken, refreshToken }
POST /auth/logout
GET  /auth/me
POST /auth/change-password
```

### Inventory
```
GET    /inventory          → paginated, filterable list
POST   /inventory          → create item (admin)
GET    /inventory/:id      → item + batches + movements
PUT    /inventory/:id      → update (admin)
DELETE /inventory/:id      → archive (admin)
POST   /inventory/:id/adjust → stock adjustment
GET    /inventory/export   → CSV download
POST   /inventory/import   → CSV upload
GET    /inventory/:id/batches
POST   /inventory/:id/batches
```

### Stock Requests
```
GET  /requests             → list (role-filtered)
POST /requests             → create (doctor/admin)
GET  /requests/:id         → detail + items + fulfillments
PUT  /requests/:id/accept  → nurse accepts
POST /requests/:id/fulfill → nurse completes (deducts stock)
PUT  /requests/:id/cancel
GET  /requests/:id/receipt → billing receipt data
```

### Stocktakes
```
GET  /stocktakes
POST /stocktakes           → create session
GET  /stocktakes/:id       → session + items + progress
PUT  /stocktakes/:id/items/:itemId → record count
POST /stocktakes/:id/complete      → finalise + apply adjustments
POST /stocktakes/:id/cancel
```

### Invoices
```
GET  /invoices
POST /invoices             → create with line items
GET  /invoices/:id
PUT  /invoices/:id         → update (before posting)
POST /invoices/:id/post    → apply stock updates
```

### Reports
```
GET /reports/dashboard     → summary stats
GET /reports/stock-on-hand → full stock report (+ CSV)
GET /reports/low-stock
GET /reports/expiring      → ?days=60
GET /reports/usage         → ?from&to&group_by=item|doctor|category
GET /reports/valuation     → by category
GET /reports/supplier-spend
GET /reports/movements     → stock movement history (+ CSV)
```

### Admin
```
GET  /users
POST /users
PUT  /users/:id
POST /users/:id/reset-password
DELETE /users/:id          → deactivate

GET  /audit                → paginated audit log (+ CSV)
GET  /categories           (all roles)
POST /categories           (admin)
GET  /suppliers            (all roles)
POST /suppliers            (admin)
```

---

## User Roles & Permissions

| Action | Admin | Doctor | Nurse |
|--------|-------|--------|-------|
| View inventory | ✓ | ✓ | ✓ |
| Add/edit inventory | ✓ | ✗ | ✗ |
| Adjust stock | ✓ | ✗ | ✓ |
| Create requests | ✓ | ✓ | ✗ |
| Accept requests | ✓ | ✗ | ✓ |
| Fulfil requests | ✓ | ✗ | ✓ |
| Create stocktakes | ✓ | ✗ | ✓ |
| Manage invoices | ✓ | ✗ | ✗ |
| View reports | ✓ | ✓ | ✓ |
| Manage users | ✓ | ✗ | ✗ |
| View audit log | ✓ | ✗ | ✗ |

---

## Security Features

- **JWT with rotation** — short-lived access tokens (15min) + long-lived refresh tokens (30d)
- **Refresh token hashing** — stored as bcrypt hash, not plaintext
- **Account lockout** — configurable failed attempt limit
- **Rate limiting** — 500 req/15min general, 20 req/15min on login
- **Helmet** — security headers (CSP, HSTS, etc.)
- **Parameterized queries** — prevents SQL injection (raw `pg` with `$1` params)
- **Input validation** — Zod schemas on all endpoints
- **Audit trail** — every stock change, login, and admin action logged
- **Session timeout** — configurable via env vars
- **No hardcoded secrets** — all config via environment variables

---

## Workflow Diagrams

### Doctor → Nurse Request Flow
```
Doctor creates request
       ↓
Status: PENDING → Nurse queue
       ↓
Nurse accepts → Status: ACCEPTED
       ↓
Nurse records usage (batch, qty, expiry)
       ↓
Stock deducted (transactional) → Status: FULFILLED
       ↓
Fulfilment receipt visible to doctor + admin
       ↓
Admin uses receipt for patient billing
```

### Invoice → Stock Flow
```
Admin enters supplier invoice
       ↓
Status: RECEIVED (stock NOT yet updated)
       ↓
Admin verifies → Status: VERIFIED (optional)
       ↓
Admin posts → Status: POSTED
       ↓
Stock quantities updated
Batch records created
Supplier cost updated
Adjustment logged
Audit entry created
```

---

## Deployment

### Quick Start
```bash
# Linux/Mac
cp .env.example .env
# Edit .env with your secrets
./setup.sh

# Windows
setup.bat
```

### Manual
```bash
cp .env.example .env
# Edit .env — change DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET
docker compose up --build -d
```

### Production Checklist
- [ ] Change `DB_PASSWORD` to a strong random value
- [ ] Generate `JWT_SECRET` with `openssl rand -hex 64`
- [ ] Generate `JWT_REFRESH_SECRET` with `openssl rand -hex 64`
- [ ] Change all default user passwords immediately after first login
- [ ] Set up TLS/HTTPS (nginx reverse proxy recommended)
- [ ] Configure regular PostgreSQL backups
- [ ] Set `NODE_ENV=production`

---

## Backup & Recovery

### Manual Backup
```bash
docker exec medinv_postgres pg_dump -U medinv medical_inventory > backup_$(date +%Y%m%d).sql
```

### Restore
```bash
docker exec -i medinv_postgres psql -U medinv medical_inventory < backup_20240101.sql
```

### Automated Backup (cron)
```cron
0 2 * * * docker exec medinv_postgres pg_dump -U medinv medical_inventory | gzip > /backups/medinv_$(date +\%Y\%m\%d).sql.gz
```

---

## Open-Source Dependencies

### Backend
| Package | License | Purpose |
|---------|---------|---------|
| express | MIT | Web framework |
| pg | MIT | PostgreSQL client |
| jsonwebtoken | MIT | JWT tokens |
| bcryptjs | MIT | Password hashing |
| zod | MIT | Schema validation |
| helmet | MIT | Security headers |
| cors | MIT | CORS handling |
| express-rate-limit | MIT | Rate limiting |
| compression | MIT | Response compression |
| csv-parse | MIT | CSV import |
| csv-stringify | MIT | CSV export |
| multer | MIT | File upload |
| dotenv | BSD-2 | Environment config |
| uuid | MIT | UUID generation |

### Frontend
| Package | License | Purpose |
|---------|---------|---------|
| react | MIT | UI framework |
| react-router-dom | MIT | Client routing |
| @tanstack/react-query | MIT | Server state |
| axios | MIT | HTTP client |
| react-hook-form | MIT | Form handling |
| zod | MIT | Validation |
| tailwindcss | MIT | CSS framework |
| @tailwindcss/forms | MIT | Form styling |
| recharts | MIT | Charts |
| lucide-react | ISC | Icons |
| date-fns | MIT | Date utilities |
| papaparse | MIT | CSV client-side |
| react-hot-toast | MIT | Notifications |

### Infrastructure
| Package | License | Purpose |
|---------|---------|---------|
| PostgreSQL 16 | PostgreSQL | Database |
| nginx | BSD-2 | Web/proxy server |
| Docker | Apache 2 | Containerisation |
| Node.js 20 LTS | MIT | Runtime |
