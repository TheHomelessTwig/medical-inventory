# MedInventory

A self-contained, open-source inventory management system built specifically for small-to-medium medical practices. Runs entirely on your own hardware — no cloud accounts, no subscriptions, no external dependencies.

```
┌─────────────────────────────────────────────────────┐
│  Browser  →  http://[server-ip]:3000                │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │  React   │    │ Express  │    │  PostgreSQL  │  │
│  │ Frontend │───▶│  API     │───▶│  Database    │  │
│  │  (nginx) │    │ (Node)   │    │              │  │
│  └──────────┘    └──────────┘    └──────────────┘  │
│                                                     │
│  All three run as Docker containers on one machine  │
└─────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Quick Start](#quick-start)
3. [First Login](#first-login)
4. [User Roles](#user-roles)
5. [Feature Overview](#feature-overview)
6. [Core Workflows](#core-workflows)
7. [Installation — Windows (Installer)](#installation--windows-installer)
8. [Installation — Manual (Any OS)](#installation--manual-any-os)
9. [Environment Variables](#environment-variables)
10. [Remote Updates](#remote-updates)
11. [Connecting Multiple Devices](#connecting-multiple-devices)
12. [Backup & Restore](#backup--restore)
13. [Development Setup](#development-setup)
14. [Project Structure](#project-structure)

---

## What It Does

MedInventory replaces paper-based or spreadsheet stock management with a purpose-built web application for clinic staff. Key capabilities:

| Capability | Description |
|---|---|
| **Stock tracking** | Real-time quantities, reorder alerts, expiry warnings, batch/lot numbers |
| **Doctor ordering** | Doctors use a POS-style screen to request stock from nurses |
| **Nurse fulfilment** | Nurses accept requests, dispense items, and auto-generate clinical notes |
| **Quick Charge** | Nurses can charge stock directly against a patient/doctor without a prior request |
| **Stocktakes** | Full, cycle, or partial stocktakes with printable count sheets and variance reports |
| **Supplier invoices** | Record incoming invoices and update stock levels in one step |
| **Reports** | Usage by item, by nurse, by date range; revenue summaries; trend charts |
| **Audit trail** | Every create, update, delete, and stock movement is logged with user and timestamp |
| **Notifications** | In-browser sound + toast when a new request or receipt arrives |
| **Access control** | Three roles (Admin, Doctor, Nurse) with server-enforced permissions |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — includes everything needed (Docker Engine + Compose)
- 4 GB RAM minimum, 8 GB recommended
- Windows 10/11, macOS 12+, or any modern Linux

### 1. Configure environment

```bash
cp .env.example .env
```

Open `.env` and at minimum change:

```env
DB_PASSWORD=choose_a_strong_password
JWT_SECRET=at_least_32_random_characters_here
JWT_REFRESH_SECRET=different_32_random_characters_here
```

> **Tip — generate secrets instantly:**
> ```bash
> # Linux / macOS
> openssl rand -hex 64
> # Windows PowerShell
> [BitConverter]::ToString([Security.Cryptography.RandomNumberGenerator]::GetBytes(64)) -replace '-',''
> ```

### 2. Start the application

```bash
docker compose up --build -d
```

First run downloads base images and builds the app (~3–5 minutes). Subsequent starts take under 30 seconds.

### 3. Open in browser

```
http://localhost:3000
```

Or from another device on the same network:

```
http://<server-ip>:3000
```

---

## First Login

Three demo accounts are seeded automatically. **Change all passwords immediately after first login.**

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@clinic.local | Admin123! |
| Doctor | doctor@clinic.local | Doctor123! |
| Nurse | nurse@clinic.local | Nurse123! |

To change your password: click your name in the bottom-left of the sidebar → **Change Password**.

Users with `must_change_password = true` (set by admin) are forced to change before they can do anything else.

---

## User Roles

MedInventory enforces roles on both the frontend (what you see) and the backend (what the API allows). A user cannot bypass restrictions by crafting API requests.

### Admin
Full access to everything. Responsible for:
- Creating and managing user accounts
- Adding categories, suppliers, inventory items
- Entering supplier invoices
- Running reports and viewing the audit log
- Configuring the system (Settings page)

### Doctor
- **New Order screen**: POS-style grid to request stock from nurses (patient name, priority, notes)
- Views only their own requests and the fulfilment status of each
- Cannot see other doctors' requests
- Cannot access invoices, users, audit log, or settings

### Nurse
- **Quick Charge screen**: Charge stock directly against a doctor/patient without waiting for a request
- Accepts and fulfils doctor stock requests
- Runs and completes stocktakes
- Cannot access invoices, reports, users, audit log, or settings

---

## Feature Overview

### Inventory Management
- Items have: name, SKU, barcode, category, supplier, unit, price, GST rate, storage location, reorder threshold, batch tracking flag, and **dispense step**
- The **dispense step** controls how the +/− buttons increment quantity in the ordering screens (e.g. set to `5` for items dispensed in packs of five)
- Stock levels update automatically on every fulfilment, quick charge, invoice posting, or manual adjustment
- **Low stock alerts** appear on the dashboard and inventory list when `quantity_on_hand ≤ reorder_threshold`
- **Expiry alerts** appear when any batch expires within 30 days

### Doctor Ordering (New Order Screen)
1. Doctor opens **New Order** in the sidebar
2. Taps items from the category grid (fuzzy search available)
3. Adjusts quantities with +/− (respects each item's dispense step)
4. Fills in patient name / reference and priority (Low / Normal / High / Urgent)
5. Clicks **Send to Nurses** — creates a pending `stock_request`
6. All nurses immediately see the request in their Requests list
7. Nurse accepts → fulfils → stock deducted → doctor sees completed receipt

### Nurse Quick Charge (POS Screen)
1. Nurse opens **Quick Charge** in the sidebar
2. Taps items from the category grid
3. Selects the associated doctor from the dropdown
4. Optionally enters patient name and reference
5. Clicks **Send Receipt to Doctor** — stock is deducted instantly and a `QC-XXXXXX` receipt is created
6. Doctor sees the receipt in their Requests list (marked as quick charge)

### Stock Requests Workflow (Detail)
- Requests flow through states: `pending` → `accepted` → `in_progress` → `fulfilled`
- Nurses can partially fulfil (substitutions supported — different item flagged)
- Each fulfilment produces a **copyable stock note** formatted for pasting into clinical systems:
  ```
  Stock used
  3x Amoxicillin 500mg
  1x Gauze Roll
  ```
- Priority (Urgent/High) items sort to the top of the nurse request list

### Stocktakes
1. Admin or nurse creates a stocktake session (Full / Cycle / Partial by category or location)
2. Print a **count sheet** — A4 table with expected quantities and blank "Counted" columns
3. Staff walk the clinic, fill in physical counts on the paper sheet
4. Enter counted quantities into the system (search/filter uncounted items)
5. System calculates variance (counted − expected) for each item
6. Complete the stocktake — optionally apply all variances as stock adjustments
7. Export results to CSV for records

### Reports
- **Usage**: total quantities dispensed by item, grouped by time period
- **By nurse**: which nurses handled which requests, quantities used, charges
- **Revenue**: total billing per period, trend charts (daily / weekly / monthly)
- **Invoices**: line-item export of all invoice records
- All reports support date-range filtering and CSV export

### Notifications
- Every 30 seconds, the app silently polls for new activity
- **Nurses** hear a two-tone chime and see a toast notification when a new doctor request arrives
- **Doctors/Admins** are notified when a nurse submits a quick-charge receipt
- Sound uses the Web Audio API — no external sound files needed
- Respects browser audio permissions; fails silently if audio is blocked

### Audit Log
Every significant action is recorded:
- Who performed it (user name, role, IP address)
- What entity was affected (type + ID + name)
- Old values and new values (JSON diff)
- Timestamp

The audit log is append-only — no user can delete records.

### Session Security
- JWT access tokens expire after 15 minutes; automatically refreshed using 30-day refresh tokens
- Accounts lock after 5 failed login attempts (configurable) for 15 minutes
- **Session idle timeout**: after 28 minutes of inactivity, a countdown warning appears; auto-logout at 30 minutes
- All secrets stored in `.env`, never committed to version control

---

## Core Workflows

### Adding a New Item to Inventory

1. Log in as **Admin**
2. Go to **Inventory** → **Add Item**
3. Fill in required fields: Name, Unit, Category (optional)
4. Set **Internal Price** (used for billing calculations)
5. Set **Reorder Threshold** (triggers low-stock alert)
6. Set **Dispense Step** (e.g. `5` for items sold in packs of 5)
7. Save — the item is now available in the ordering and quick-charge screens

### Recording a Supplier Invoice

1. Log in as **Admin**
2. Go to **Invoices** → **New Invoice**
3. Enter invoice number, supplier, and date
4. Add line items — link each to an existing inventory item
5. Enter quantities and unit costs; GST calculated automatically
6. **Post** the invoice — stock levels update for all linked items

### Running a Stocktake

1. **Admin/Nurse**: Stocktakes → New Stocktake → choose Full / Cycle / Partial
2. Click **Count Sheet** to print a paper form with expected quantities
3. Walk the clinic, count physical stock, write on the form
4. Back at the computer: enter counted quantities item by item
5. Use the **Filter uncounted** toggle to track progress
6. Click **Complete** and choose whether to apply variances as adjustments
7. Export the results to CSV if needed for compliance records

### Fulfilling a Doctor Request

1. Log in as **Nurse**
2. Go to **Requests** — new requests appear at the top, sorted by priority
3. Open the request → click **Accept** (moves to `accepted` status)
4. Click **Fulfil** — a modal shows all requested items
5. Confirm quantities (adjust if short), select batch numbers if batch-tracked
6. Note any substitutions (different item used) with a reason
7. Click **Complete Fulfilment** — stock deducted, doctor notified
8. The fulfilment record shows a **green copyable panel** — click Copy to paste into clinical notes

---

## Installation — Windows (Installer)

The Inno Setup installer (`installer/MedInventory.iss`) produces a standard Windows `.exe` that:

1. Checks for Docker Desktop — downloads and installs it if missing
2. Prompts for install directory (default: `C:\MedInventory`)
3. Copies all application files
4. Generates a `.env` file with cryptographically random secrets
5. Opens Windows Firewall port 3000 for LAN access
6. Runs `docker compose up --build -d` to start the application
7. Creates a desktop shortcut and Start Menu entry
8. Registers a Windows Task Scheduler job to auto-start on boot

### Building the installer

1. Install [Inno Setup](https://jrsoftware.org/isdl.php) (free)
2. Open `installer/MedInventory.iss` in Inno Setup
3. Click **Build → Compile**
4. The installer `.exe` appears in `installer/output/`

---

## Installation — Manual (Any OS)

### Linux / macOS

```bash
# 1. Clone the repository
git clone https://github.com/TheHomelessTwig/medical-inventory.git
cd medical-inventory

# 2. Configure
cp .env.example .env
nano .env   # set DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET

# 3. Start
docker compose up --build -d

# 4. Optional: auto-start on Linux (systemd)
sudo cp docs/medinventory.service /etc/systemd/system/
sudo systemctl enable --now medinventory
```

### Verifying it's running

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

---

## Environment Variables

All configuration lives in `.env`. Copy `.env.example` as a starting point.

| Variable | Default | Description |
|---|---|---|
| `DB_NAME` | `medical_inventory` | PostgreSQL database name |
| `DB_USER` | `medinv` | PostgreSQL user |
| `DB_PASSWORD` | *(required)* | PostgreSQL password — must be changed |
| `JWT_SECRET` | *(required)* | Secret for signing access tokens — minimum 32 characters |
| `JWT_REFRESH_SECRET` | *(required)* | Secret for signing refresh tokens — different from JWT_SECRET |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token lifetime |
| `NODE_ENV` | `production` | Set to `development` for verbose logging |
| `CORS_ORIGIN` | `*` | Allowed CORS origin. Use `*` for LAN access or restrict to a specific IP |
| `SESSION_TIMEOUT_MINUTES` | `30` | Minutes of inactivity before auto-logout |
| `MAX_LOGIN_ATTEMPTS` | `5` | Failed attempts before account lockout |
| `LOCKOUT_MINUTES` | `15` | How long an account stays locked |

> **Never commit `.env` to version control.** The `.gitignore` excludes it.

---

## Remote Updates

### Windows

```powershell
cd C:\MedInventory
powershell -ExecutionPolicy Bypass -File update.ps1
```

### Linux / macOS

```bash
cd /opt/medinv
bash update.sh
```

Both scripts:
1. Create a timestamped database backup (`backups/pre_update_YYYYMMDD_HHMM.sql.gz`)
2. Pull the latest code from git (if the directory is a git repository)
3. Rebuild Docker containers
4. Restart services
5. Wait up to 60 seconds for the health check to confirm the app is running

**Skip git pull** (when deploying manually copied files):

```powershell
powershell -ExecutionPolicy Bypass -File update.ps1 -SkipGitPull
```

**Skip database backup:**

```powershell
powershell -ExecutionPolicy Bypass -File update.ps1 -NoBackup
```

---

## Connecting Multiple Devices

MedInventory is designed for LAN access — every device on the same network can use it through the server's IP address.

### Finding the server IP

**Windows:** `ipconfig` → look for IPv4 address (usually `192.168.x.x`)  
**Linux/macOS:** `ip addr` or `ifconfig`

### Connecting

```
http://192.168.1.100:3000
```

Replace `192.168.1.100` with your server's actual IP. Works from any browser — phone, tablet, or desktop.

### How it works

All API calls use relative URLs (`/api/...`). The nginx container inside Docker proxies them to the backend — so the frontend code works identically regardless of which IP the browser connects from. No configuration changes are needed when connecting from a new device.

---

## Backup & Restore

### Manual backup

```bash
docker exec medinv_postgres pg_dump -U medinv medical_inventory | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore from backup

```bash
gunzip -c backup_20260101.sql.gz | docker exec -i medinv_postgres psql -U medinv medical_inventory
```

### Automated backups (Linux)

Add to crontab (`crontab -e`):

```cron
0 2 * * * docker exec medinv_postgres pg_dump -U medinv medical_inventory | gzip > /opt/medinv/backups/daily_$(date +\%Y\%m\%d).sql.gz
```

---

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (or run via Docker)
- npm

### 1. Backend

```bash
cd backend
cp ../.env.example ../.env
# Edit .env: set DB_HOST=localhost, NODE_ENV=development
npm install
npm run dev        # nodemon with ts-node, restarts on save
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server at http://localhost:5173
```

Configure `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:4000
```

### 3. Running tests

```bash
# Backend (requires a running PostgreSQL with the test DB)
cd backend
npm test

# Frontend
cd frontend
npm test
```

Tests use an isolated `medical_inventory_test` database that is created and destroyed automatically. Never run tests against the production database.

### Dev with Docker (recommended)

```bash
docker compose -f docker-compose.dev.yml up
```

This mounts source files as volumes so changes to TypeScript files rebuild automatically without a full Docker rebuild.

---

## Project Structure

```
medical-inventory/
│
├── docker-compose.yml          # Production: postgres + backend + frontend (nginx)
├── docker-compose.dev.yml      # Development: live-reload volumes
├── .env.example                # Template — copy to .env and fill in secrets
├── version.json                # Current app version (read by /api/system/version)
├── update.ps1                  # Windows remote-update script
├── update.sh                   # Linux/macOS remote-update script
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── app.ts              # Express app setup (routes, middleware)
│       ├── index.ts            # Entry point — calls app.listen()
│       ├── db.ts               # PostgreSQL pool + transaction helper
│       ├── schema.sql          # Full database schema (run once on fresh DB)
│       ├── seed.sql            # Demo users and sample data
│       ├── middleware/
│       │   ├── auth.ts         # JWT verification, requireRole helpers
│       │   └── errorHandler.ts # Centralised error responses
│       ├── routes/
│       │   ├── auth.ts         # Login, logout, token refresh, me
│       │   ├── inventory.ts    # CRUD, adjust stock, CSV import/export
│       │   ├── requests.ts     # Doctor requests + nurse fulfilment + quick-charge
│       │   ├── stocktakes.ts   # Stocktake sessions, item counting, CSV export
│       │   ├── invoices.ts     # Supplier invoices, line items, posting
│       │   ├── reports.ts      # Usage, nurse summary, revenue, trends
│       │   ├── users.ts        # User management (admin only)
│       │   ├── audit.ts        # Audit log queries
│       │   ├── categories.ts   # Category CRUD
│       │   ├── suppliers.ts    # Supplier CRUD
│       │   └── system.ts       # Version and health/status info
│       ├── utils/
│       │   └── audit.ts        # logAudit() helper
│       └── tests/
│           ├── globalSetup.ts  # Creates/destroys test DB
│           ├── helpers.ts      # Shared test utilities
│           └── *.test.ts       # Test files per route
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf              # Proxies /api/* to backend:4000
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx            # React entry, QueryClient, Toaster
│       ├── App.tsx             # Router, ProtectedRoute, all page routes
│       ├── api/
│       │   └── client.ts       # Axios instance, interceptors, token refresh
│       ├── context/
│       │   └── AuthContext.tsx # Auth state, login/logout, token storage
│       ├── types/
│       │   └── index.ts        # All shared TypeScript interfaces
│       ├── hooks/
│       │   ├── useDebounce.ts
│       │   ├── useIdleTimeout.ts      # Session idle detection
│       │   └── useNotifications.ts    # Polling + Web Audio beep
│       ├── components/
│       │   ├── Layout.tsx             # Shell with sidebar + outlet
│       │   ├── Sidebar.tsx            # Navigation (role-filtered)
│       │   ├── Header.tsx             # Mobile hamburger
│       │   ├── Modal.tsx              # Reusable modal wrapper
│       │   ├── ConfirmDialog.tsx      # Reusable confirm prompt
│       │   ├── Badge.tsx              # Status/priority colour chips
│       │   ├── LoadingSpinner.tsx
│       │   ├── ItemSearchSelect.tsx   # Fuzzy-search item combobox
│       │   └── SessionTimeoutWarning.tsx
│       └── pages/
│           ├── Login.tsx
│           ├── ChangePassword.tsx
│           ├── Dashboard.tsx          # KPIs, charts, alerts
│           ├── Inventory.tsx          # Item list, add/edit, adjust stock
│           ├── DoctorOrder.tsx        # POS-style ordering for doctors
│           ├── POS.tsx                # Quick Charge screen for nurses
│           ├── Requests.tsx           # Request list
│           ├── RequestDetail.tsx      # Request detail + fulfilment + stock note
│           ├── Stocktakes.tsx         # Stocktake list + print count sheet
│           ├── StocktakeSession.tsx   # Active counting session
│           ├── Invoices.tsx           # Invoice list
│           ├── InvoiceDetail.tsx      # Invoice detail + posting
│           ├── Reports.tsx            # Usage / nurse / revenue reports
│           ├── Users.tsx              # User management (admin)
│           ├── AuditLog.tsx           # Audit trail viewer
│           └── Settings.tsx           # Categories, suppliers, system info
│
└── installer/
    ├── install.ps1             # Windows PowerShell installer script
    ├── uninstall.ps1           # Windows uninstaller
    └── MedInventory.iss        # Inno Setup script → builds Setup_MedInventory.exe
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend framework | React | 18 |
| Language (frontend) | TypeScript | 5 |
| Build tool | Vite | 5 |
| Styling | Tailwind CSS | 3 |
| Server state | TanStack Query | 5 |
| Forms | React Hook Form | 7 |
| Charts | Recharts | 2 |
| Routing | React Router | 6 |
| Backend framework | Express | 4 |
| Language (backend) | TypeScript / Node.js | 20 |
| Database | PostgreSQL | 16 |
| Validation | Zod | 3 |
| Auth | JWT (jsonwebtoken + bcrypt) | — |
| Containerisation | Docker + Compose | — |
| Reverse proxy | nginx (Alpine) | — |
| Testing | Vitest + supertest | — |

All dependencies are free and open-source. No paid services, no telemetry, no external API calls.

---

## Licence

MIT — use freely, modify freely, deploy on your own infrastructure.
