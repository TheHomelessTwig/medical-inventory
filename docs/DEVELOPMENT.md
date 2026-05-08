# MedInventory — Development Guide

Everything you need to run, test, and extend MedInventory locally.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Project Layout](#project-layout)
4. [Backend Development](#backend-development)
5. [Frontend Development](#frontend-development)
6. [Testing](#testing)
7. [Adding a New Feature](#adding-a-new-feature)
8. [Database Migrations](#database-migrations)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| npm | 9+ | Comes with Node |
| PostgreSQL | 16 | Or run via Docker |
| Docker Desktop | Latest | For full-stack dev |
| Git | Any | |

---

## Local Development Setup

### Option A — Full Docker (simplest)

Everything runs in containers with live-reload mounts.

```bash
git clone https://github.com/TheHomelessTwig/medical-inventory.git
cd medical-inventory
cp .env.example .env
# Edit .env — set any passwords you like for dev

docker compose -f docker-compose.dev.yml up
```

- Frontend dev server: `http://localhost:5173` (Vite with HMR)
- Backend: `http://localhost:4000`
- PostgreSQL: `localhost:5432` (exposed for DB tools)

### Option B — Native (faster iteration)

Run each service directly on your machine.

#### 1. Start PostgreSQL

```bash
docker run -d --name medinv-dev-pg \
  -e POSTGRES_DB=medical_inventory \
  -e POSTGRES_USER=medinv \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5432:5432 \
  postgres:16-alpine
```

#### 2. Configure `.env`

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=medical_inventory
DB_USER=medinv
DB_PASSWORD=devpassword

JWT_SECRET=dev_secret_at_least_32_characters_long
JWT_REFRESH_SECRET=dev_refresh_secret_different_value
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
SESSION_TIMEOUT_MINUTES=30
```

#### 3. Start the backend

```bash
cd backend
npm install
npm run dev
# Starts nodemon — restarts automatically on TypeScript changes
# Listening on http://localhost:4000
```

#### 4. Start the frontend

```bash
cd frontend
npm install
# Create frontend/.env.local:
echo "VITE_API_URL=http://localhost:4000" > .env.local
npm run dev
# Vite dev server at http://localhost:5173
```

---

## Project Layout

```
medical-inventory/
├── backend/src/
│   ├── app.ts           ← Express setup — add routes here
│   ├── index.ts         ← Entry point (listen)
│   ├── db.ts            ← pg Pool + withTransaction()
│   ├── schema.sql       ← Full DB schema (source of truth)
│   ├── seed.sql         ← Demo data inserted on fresh DB
│   ├── middleware/
│   │   ├── auth.ts      ← authenticate, requireRole, requireAdmin
│   │   └── errorHandler.ts
│   ├── routes/          ← One file per resource
│   ├── utils/audit.ts   ← logAudit() helper
│   └── tests/
│       ├── globalSetup.ts    ← Creates/drops test DB
│       ├── helpers.ts        ← clearTransactionalData(), auth tokens
│       └── *.test.ts
│
└── frontend/src/
    ├── main.tsx         ← ReactDOM.render, QueryClient, Toaster
    ├── App.tsx          ← BrowserRouter, all Routes
    ├── api/client.ts    ← Axios instance + interceptors
    ├── context/AuthContext.tsx
    ├── types/index.ts   ← All shared TS interfaces
    ├── hooks/           ← useDebounce, useIdleTimeout, useNotifications
    ├── components/      ← Reusable UI
    └── pages/           ← One file per route
```

---

## Backend Development

### TypeScript compilation

```bash
cd backend
npm run build    # tsc → dist/
npm run dev      # nodemon + ts-node (no build needed)
```

### Adding a new route file

1. Create `backend/src/routes/widgets.ts`:

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { query } from '../db';

const router = Router();
router.use(authenticate);  // all routes in this file require login

// GET /api/widgets
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query('SELECT * FROM widgets ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    next(err);  // always next(err) — never throw from a route handler
  }
});

export default router;
```

2. Register in `app.ts`:

```typescript
import widgetRoutes from './routes/widgets';
// ...
app.use('/api/widgets', widgetRoutes);
```

### Database queries

Use the `query()` helper for simple queries:

```typescript
import { query } from '../db';

const result = await query(
  'SELECT id, name FROM inventory_items WHERE id = $1',
  [itemId]
);
const item = result.rows[0];
```

Use `withTransaction()` when multiple queries must succeed or fail together:

```typescript
import { withTransaction } from '../db';

const result = await withTransaction(async (client) => {
  const item = await client.query(
    'SELECT quantity_on_hand FROM inventory_items WHERE id = $1 FOR UPDATE',
    [itemId]
  );
  await client.query(
    'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - $1 WHERE id = $2',
    [qty, itemId]
  );
  return item.rows[0];
});
// If any query throws, the transaction is rolled back automatically
```

### Validation with Zod

```typescript
import { z } from 'zod';

const widgetSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().min(0).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const body = widgetSchema.parse(req.body);  // throws ZodError on invalid input
    // use body.name, body.price safely
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});
```

### Audit logging

```typescript
import { logAudit, getClientInfo } from '../utils/audit';

const { ipAddress, userAgent } = getClientInfo(req);
await logAudit({
  user: req.user,          // attached by authenticate middleware
  action: 'WIDGET_CREATED',
  entityType: 'widget',
  entityId: newItem.id,
  entityName: newItem.name,
  newValues: body,
  ipAddress,
  userAgent,
});
```

---

## Frontend Development

### Component structure

```typescript
// pages/Widgets.tsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../api/client';
import toast from 'react-hot-toast';

const Widgets: React.FC = () => {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['widgets'],
    queryFn: () => api.get('/widgets').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string }) => api.post('/widgets', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['widgets'] });
      toast.success('Widget created');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) return <div>Loading…</div>;

  return (
    <div>
      {data?.map((w: { id: string; name: string }) => <div key={w.id}>{w.name}</div>)}
    </div>
  );
};

export default Widgets;
```

### Adding a new page

1. Create `frontend/src/pages/Widgets.tsx`
2. Add the route in `App.tsx`:

```typescript
import Widgets from './pages/Widgets';

// Inside the Layout Route:
<Route path="widgets" element={<Widgets />} />

// Or with role restriction:
<Route path="widgets" element={
  <ProtectedRoute roles={['admin']}>
    <Widgets />
  </ProtectedRoute>
} />
```

3. Add to the sidebar in `Sidebar.tsx`:

```typescript
import { Box } from 'lucide-react';

const navItems: NavItem[] = [
  // ...existing items...
  { to: '/widgets', label: 'Widgets', icon: <Box size={18} />, roles: ['admin'] },
];
```

### Adding a new type

Add to `frontend/src/types/index.ts`:

```typescript
export interface Widget {
  id: string;
  name: string;
  price?: number;
  created_at: string;
}
```

### Tailwind CSS conventions

The project uses a small set of custom utility classes defined in `tailwind.config.js` and `index.css`:

| Class | What it is |
|---|---|
| `.card` | White rounded card with border and shadow |
| `.btn-primary` | Blue button |
| `.btn-secondary` | Grey outlined button |
| `.btn-success` | Green button |
| `.btn-danger` | Red button |
| `.btn-sm` | Smaller button variant |
| `.input` | Styled input / textarea / select |
| `.label` | Input label (small, semibold, slate) |
| `.page-title` | Large page heading |
| `.page-header` | Flex row for title + action buttons |
| `.table-th` | Table header cell |
| `.table-td` | Table data cell |

---

## Testing

### Test architecture

Backend tests use **Vitest** with **supertest** to make real HTTP requests against a test Express app connected to a dedicated PostgreSQL database (`medical_inventory_test`).

The test database is:
- Created fresh before every test run (globalSetup)
- Schema applied from `schema.sql`
- Seeded with 3 users and a category/supplier
- Dropped completely after all tests finish

Individual test files call `clearTransactionalData()` in `beforeEach` to reset data between tests without destroying the database.

### Running tests

```bash
cd backend
npm test            # runs all tests once
npm run test:watch  # re-runs on file changes
npm run test:ui     # opens Vitest browser UI
```

### Test isolation configuration

Tests run sequentially (`maxWorkers: 1`) and share a single PostgreSQL pool (`isolate: false`) to avoid database connection pool exhaustion. This is configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    globalSetup: './src/tests/globalSetup.ts',
    maxWorkers: 1,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

### Writing a test

```typescript
// backend/src/tests/widgets.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { clearTransactionalData, getAdminToken } from './helpers';

describe('Widgets API', () => {
  let adminToken: string;

  beforeEach(async () => {
    await clearTransactionalData();
    adminToken = await getAdminToken();
  });

  it('GET /api/widgets returns empty array initially', async () => {
    const res = await request(app)
      .get('/api/widgets')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/widgets creates a widget', async () => {
    const res = await request(app)
      .post('/api/widgets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Widget' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Widget');
  });
});
```

### Frontend tests

```bash
cd frontend
npm test
```

Frontend tests use **Vitest** + **React Testing Library**. They live in `frontend/src/tests/` and test component behaviour (rendering, user interaction, form submission).

---

## Adding a New Feature

Here is the recommended sequence for adding a full-stack feature:

### 1. Database changes

If you need new columns or tables, add them to `schema.sql` using `IF NOT EXISTS` / `IF NOT EXISTS` guards so the file remains idempotent for fresh installs:

```sql
ALTER TABLE widgets ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#6366f1';
```

Then run the migration on the live/dev database:

```bash
docker exec medinv_postgres psql -U medinv medical_inventory -c \
  "ALTER TABLE widgets ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '##6366f1';"
```

### 2. Backend route

Add or extend a route file as described in [Backend Development](#backend-development). Test with `curl` or a REST client:

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/widgets
```

### 3. TypeScript type

Add the new shape to `frontend/src/types/index.ts`.

### 4. Frontend page / component

Build the UI and wire up `useQuery` / `useMutation`.

### 5. Tests

Write tests for the new backend routes.

### 6. Rebuild Docker

```bash
docker compose up --build -d
```

---

## Database Migrations

MedInventory uses a **manual migration** approach — no migration framework. The `schema.sql` file is the single source of truth for the schema, and all `CREATE TABLE` / `CREATE INDEX` statements use `IF NOT EXISTS`.

When adding or modifying schema:

1. **Update `schema.sql`** — add the new `CREATE TABLE` or `ALTER TABLE` statement with `IF NOT EXISTS`
2. **Run on the live database** — use a direct `psql` / `ALTER TABLE` command
3. **Test on a fresh database** — `docker compose down -v && docker compose up --build -d` to verify `schema.sql` produces the correct schema from scratch

For the existing running database:

```bash
# Connect to the running Postgres container
docker exec -it medinv_postgres psql -U medinv medical_inventory

# Run your ALTER TABLE
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS new_column VARCHAR(100);
\q
```

---

## Troubleshooting

### Containers won't start

```bash
docker compose logs backend
docker compose logs frontend
docker compose logs postgres
```

Common causes:
- `.env` is missing or has incorrect values
- Port 3000 is already in use by another process
- Docker Desktop is not running

### Backend "Cannot find module" errors

The backend is compiled TypeScript — ensure you're running `npm run dev` (ts-node) or `npm run build` first.

### Frontend build fails with TypeScript errors

```bash
cd frontend && npx tsc --noEmit
```

This shows all type errors without building.

### Database connection refused

If running natively (not Docker):
- Confirm PostgreSQL is running: `pg_isready -h localhost`
- Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in `.env`
- Confirm the database exists: `psql -U medinv -l`

### Test failures

```bash
cd backend && npm test -- --reporter=verbose
```

Common causes:
- Tests run in parallel (ensure `maxWorkers: 1` is set in `vitest.config.ts`)
- Test database doesn't exist (globalSetup failed — check PostgreSQL is running and credentials are correct)
- Leftover data from a previous aborted test run — the globalSetup drops and recreates the database on each run, so a fresh `npm test` should fix it

### Stock quantity goes negative

This should not happen under normal operation due to `FOR UPDATE` locking. If you see negative quantities:
1. Check the `stock_adjustments` table for the item — find which operation caused the deduction
2. Use a manual `correction` adjustment to restore the correct value
3. Check the audit log for unexpected activity
