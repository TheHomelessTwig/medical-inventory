# S.H.I.T.
### Sam's Helpful Inventory Tracker

A self-contained, open-source inventory management system built for small-to-medium medical practices. Runs entirely on your own hardware — no cloud accounts, no subscriptions, no external dependencies.

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

1. [Screenshots](#screenshots)
2. [What It Does](#what-it-does)
3. [Quick Start](#quick-start)
4. [First Login](#first-login)
5. [User Roles](#user-roles)
6. [Feature Overview](#feature-overview)
7. [Installation — Windows (Installer)](#installation--windows-installer)
8. [Installation — Docker (Any OS)](#installation--docker-any-os)
9. [Installation — WSL2 (Windows without Docker Desktop)](#installation--wsl2-windows-without-docker-desktop)
10. [Environment Variables](#environment-variables)
11. [Email Notifications Setup](#email-notifications-setup)
12. [Remote Updates](#remote-updates)
13. [Connecting Multiple Devices](#connecting-multiple-devices)
14. [Backup & Restore](#backup--restore)
15. [Development Setup](#development-setup)
16. [Project Structure](#project-structure)
17. [Technology Stack](#technology-stack)

---

## Screenshots

### Login
![Login page showing S.H.I.T. branding](docs/screenshots/login.png)

### Dashboard (Dark Mode)
![Dashboard in dark mode with KPI cards and activity feed](docs/screenshots/dashboard-dark.png)

### Inventory
![Inventory list with item cards, search and filters](docs/screenshots/inventory.png)

### Doctor — New Order (POS Screen)
![Doctor POS-style order screen with item grid and basket](docs/screenshots/doctor-order.png)

### Nurse — Quick Charge (POS Screen)
![Nurse quick charge screen with category filter pills and checkout panel](docs/screenshots/quick-charge.png)

### Requests
![Stock requests list with status badges and priority sorting](docs/screenshots/requests.png)

### Reports
![Usage reports with date range filter and charts](docs/screenshots/reports.png)

### My Account (Profile)
![User profile page with dark mode toggle and accent colour picker](docs/screenshots/profile.png)

### Settings (Admin)
![Admin settings with clinic theme colour picker and system info](docs/screenshots/settings.png)

---

## What It Does

| Capability | Description |
|---|---|
| **Stock tracking** | Real-time quantities, reorder alerts, expiry warnings, batch/lot numbers |
| **Doctor ordering** | POS-style grid to request stock from nurses — with saved templates |
| **Nurse quick charge** | Charge stock directly against a patient/doctor — with saved templates |
| **Fulfilment workflow** | Nurses accept → fulfil → doctor gets a copyable clinical note |
| **Wastage recording** | Record dropped, contaminated, or unused stock with reason tracking |
| **Returns to supplier** | Draft → confirm workflow that restores stock levels |
| **Stocktakes** | Full/cycle/partial stocktakes with printable count sheets |
| **Supplier invoices** | Record incoming stock and update levels in one step |
| **Reports** | Usage, wastage, patient ledger, revenue, budgets — all with CSV export |
| **Xero export** | Invoice data in Xero bank transactions format |
| **Budget tracking** | Monthly spend vs budget per category with dashboard widget |
| **Email notifications** | New requests, fulfilments, account lockouts, weekly summaries |
| **Barcode scanning** | USB/Bluetooth scanner support on POS and inventory screens |
| **PWA** | Installable on tablets and phones, works like a native app |
| **2FA** | TOTP two-factor authentication (Google Authenticator / Authy) |
| **Dark mode + theming** | Full dark mode; 8 accent colour presets + custom colour picker |
| **Audit trail** | Every action logged with user, timestamp, and before/after values |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)  
  — or see [WSL2 setup](#installation--wsl2-windows-without-docker-desktop) to run without Docker Desktop

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — at minimum change:

```env
DB_PASSWORD=choose_a_strong_password
JWT_SECRET=at_least_32_random_characters_here
JWT_REFRESH_SECRET=different_32_random_characters_here
```

> **Generate secrets instantly:**
> ```bash
> # Linux / macOS / WSL
> openssl rand -hex 64
> # Windows PowerShell
> [BitConverter]::ToString([Security.Cryptography.RandomNumberGenerator]::GetBytes(64)) -replace '-',''
> ```

### 2. Start

```bash
docker compose up --build -d
```

First run downloads base images and builds (~3–5 min). Subsequent starts: under 30 seconds.

### 3. Open

```
http://localhost:3000
```

Or from another device on the same network: `http://<server-ip>:3000`

---

## First Login

Three demo accounts are seeded automatically. **Change all passwords immediately.**

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@clinic.local | Admin123! |
| Doctor | doctor@clinic.local | Doctor123! |
| Nurse | nurse@clinic.local | Nurse123! |

---

## User Roles

| | Admin | Doctor | Nurse |
|---|:---:|:---:|:---:|
| Inventory (view) | ✓ | ✓ | ✓ |
| Inventory (edit/adjust/wastage) | ✓ | ✗ | ✓ |
| New Order screen (POS) | ✓ | ✓ | ✗ |
| Quick Charge screen (POS) | ✓ | ✗ | ✓ |
| Order/charge templates | ✓ | ✓ | ✓ |
| Requests (view own) | ✓ | ✓ | ✓ |
| Requests (fulfil/accept) | ✓ | ✗ | ✓ |
| Stocktakes | ✓ | ✗ | ✓ |
| Returns to supplier | ✓ | ✗ | ✓ |
| Invoices | ✓ | ✗ | ✗ |
| Reports | ✓ | ✓* | ✗ |
| Budgets | ✓ | ✗ | ✗ |
| Users / Audit / Settings | ✓ | ✗ | ✗ |

*Doctors see usage reports for their own requests only.

---

## Feature Overview

### POS Ordering Screens

**Doctor — New Order (`/order`)**
- Item grid grouped by category, fuzzy search bar, category filter pills
- Tap items to add; +/− buttons honour each item's configured dispense step
- Priority selector (Low / Normal / High / Urgent)
- Patient name + reference fields
- Save basket as a named **template**; load templates with one click
- **Barcode scanner** — scan any item to add it instantly
- Submit → pending request visible to all nurses immediately

**Nurse — Quick Charge (`/pos`)**
- Same item grid and fuzzy search
- Select doctor and optional patient details
- Save/load **charge templates** for common procedures
- **Barcode scanner** support
- Submit → stock deducted immediately, receipt sent to doctor

### Templates (Doctors and Nurses)
Both roles can save named baskets:
- Tap **Load Template** to restore a saved basket
- Type a name and click **Save** to capture the current basket
- Templates are private per user — doctors see their own, nurses see theirs
- Ideal for recurring procedures: "Flu clinic", "Wound dressing", "Pre-op tray"

### Copyable Clinical Note
After any fulfilment (normal request or quick charge), a green panel appears on the receipt:
```
Stock used
3x Amoxicillin 500mg
1x Gauze Roll 10cm
```
Click **Copy** → paste directly into your clinical notes system.

### Wastage Recording
Record stock lost without being used on a patient:
- Accessible via the bin icon on each inventory row
- Reasons: Dropped / Contaminated / Opened but unused / Incorrect dose drawn / Expired after opening / Other
- Full report in **Reports → Wastage** with cost summary and CSV export

### Returns to Supplier
1. Create a draft return (supplier, items, batches, quantities, reason)
2. Admin confirms → stock levels restored automatically
3. Full audit trail with adjustment records

### FEFO Enforcement
When fulfilling a request, clicking **Load batches** auto-selects the batch expiring soonest that still has stock (First Expired, First Out). No manual searching required.

### Budget Tracking
- Admin sets a monthly spend budget per category (Settings or via API)
- Dashboard widget shows progress bars (green → amber → red)
- `GET /api/budgets?month=YYYY-MM` for programmatic access

### Email Notifications
Set SMTP credentials in `.env` to activate (see [Email Notifications Setup](#email-notifications-setup)):
- **New request** → all active nurses receive an email
- **Request fulfilled** → the doctor receives a receipt email
- **Quick charge** → the doctor receives a notification
- **Account locked** → admins alerted
- **After-hours login** → admins alerted (login before 7am or after 8pm)
- **Weekly report** → admins receive usage summary + low stock list every Monday 8am

### Barcode Scanner
Connect any USB or Bluetooth barcode scanner — it works automatically. Scanners emit keystrokes faster than humans type; the app detects this and looks up the item by barcode or SKU. Works on the POS and inventory screens.

### Patient Ledger
Reports → Patient Ledger: search by patient name or reference to see all charges ever recorded for that patient — requests, quick charges, dates, doctors, totals.

### Two-Factor Authentication (2FA)
Set up in **My Account → Security**:
1. Click **Enable 2FA** → scan the QR code with Google Authenticator or Authy
2. Enter the 6-digit code to confirm
3. All future logins require the password **and** a TOTP code

### Progressive Web App (PWA)
Visit the app in Chrome/Edge/Safari on any device and install it:
- Chrome/Edge desktop: install icon in the address bar
- Mobile: "Add to Home Screen" in the browser menu
- Runs full-screen, no browser chrome, works like a native app
- Includes home screen shortcuts to Quick Charge and New Order

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `/` or `F` | Focus search bar |
| `N` | New item / order / request |
| `Esc` | Close modal |
| `?` | Show shortcut help |

Shortcuts are suppressed when typing inside a form field.

### Dark Mode & Theming
- **Dark mode toggle** in the sidebar (bottom) and My Account page
- **8 accent colour presets**: Blue, Indigo, Violet, Rose, Amber, Emerald, Cyan, Slate
- **Custom colour picker** for any hex value
- Admin can set the clinic-wide colour in Settings → Clinic Theme
- Each user can override on their own profile page
- All preferences saved to browser localStorage

---

## Installation — Windows (Installer)

The Inno Setup script (`installer/MedInventory.iss`) builds a standard Windows `.exe` that:

1. Checks for Docker Desktop — downloads and installs if missing
2. Prompts for install directory (default: `C:\MedInventory`)
3. Generates a `.env` with cryptographically random secrets
4. Opens Windows Firewall port 3000
5. Runs `docker compose up --build -d`
6. Creates a desktop shortcut and Start Menu entry
7. Registers a Task Scheduler job to auto-start on boot

**Building the installer:**
1. Install [Inno Setup](https://jrsoftware.org/isdl.php) (free)
2. Open `installer/MedInventory.iss` → Build → Compile
3. Find `Setup_MedInventory_v1.1.0.exe` in `installer/output/`

---

## Installation — Docker (Any OS)

### Linux / macOS

```bash
git clone https://github.com/TheHomelessTwig/medical-inventory.git
cd medical-inventory
cp .env.example .env
nano .env          # set DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET
docker compose up --build -d
```

### Verify

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

### Auto-start on Linux (systemd)

```bash
sudo nano /etc/systemd/system/shit-inventory.service
```
```ini
[Unit]
Description=S.H.I.T. Inventory
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/medinv
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=YOUR_USERNAME

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now shit-inventory
```

---

## Installation — WSL2 (Windows without Docker Desktop)

Run the app directly inside WSL2 using Docker Engine — no Docker Desktop GUI required, lower memory overhead.

### Step 1 — Install Docker Engine in WSL2

```bash
# In your WSL2 terminal (Ubuntu 22.04 recommended)
sudo apt update && sudo apt install -y ca-certificates curl gnupg

curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Run Docker without sudo
sudo usermod -aG docker $USER && newgrp docker
```

### Step 2 — Copy the project into WSL2

**Important:** Run from the WSL filesystem (`/home/...`), not from `/mnt/c/...`. Cross-filesystem I/O is slow.

```bash
cp -r /mnt/d/Claude/Claudes\ Cave/medical-inventory ~/medical-inventory
cd ~/medical-inventory
cp .env.example .env
nano .env    # set your secrets
```

### Step 3 — Start Docker and the app

```bash
sudo service docker start
docker compose up --build -d
```

The app is now running at `localhost:3000` inside WSL. Your Windows browser can reach it, but other LAN devices cannot yet.

### Step 4 — Forward port 3000 to your LAN

WSL2 has its own internal IP that changes on each restart. Run this in **Windows PowerShell (Admin)**:

```powershell
# Get WSL2's current IP and forward port 3000 through Windows
$wslIp = (wsl hostname -I).Trim().Split()[0]

netsh interface portproxy add v4tov4 `
    listenaddress=0.0.0.0 `
    listenport=3000 `
    connectaddress=$wslIp `
    connectport=3000

netsh advfirewall firewall add rule `
    name="SHIT Inventory" `
    dir=in action=allow protocol=TCP localport=3000

Write-Host "Forwarded: Windows:3000 → WSL2 $wslIp`:3000"
```

Other LAN devices can now reach the app at `http://<your-windows-ip>:3000`.

### Step 5 — Auto-start on Windows boot

Save this as `C:\startup-shit.ps1`:

```powershell
# Start WSL2 Docker + the app
wsl -d Ubuntu -- bash -c "sudo service docker start && cd ~/medical-inventory && docker compose up -d"

# Re-apply port forwarding (WSL2 IP changes on reboot)
Start-Sleep -Seconds 8
$wslIp = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=3000 2>$null
netsh interface portproxy add v4tov4 `
    listenaddress=0.0.0.0 listenport=3000 `
    connectaddress=$wslIp connectport=3000
Write-Host "S.H.I.T. started at http://$wslIp`:3000"
```

Register as a Task Scheduler job (run in PowerShell as Admin):

```powershell
$action  = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File C:\startup-shit.ps1"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Register-ScheduledTask `
    -TaskName "SHIT-Inventory-WSL" `
    -Action $action -Trigger $trigger -Principal $principal `
    -Description "Starts S.H.I.T. inventory in WSL2 on boot"
```

### Optional — systemd inside WSL2 (Ubuntu 22.04+)

Enable systemd for a cleaner auto-start. Add to `/etc/wsl.conf`:

```ini
[boot]
systemd=true
```

Restart WSL (`wsl --shutdown` in PowerShell, then reopen). Then create a systemd service:

```bash
sudo nano /etc/systemd/system/shit-inventory.service
```
```ini
[Unit]
Description=S.H.I.T. Inventory
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/YOUR_USERNAME/medical-inventory
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=YOUR_USERNAME

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now shit-inventory
```

### WSL2 memory tuning

Create `%USERPROFILE%\.wslconfig` on Windows:

```ini
[wsl2]
memory=4GB
processors=2
swap=2GB
```

Restart WSL: `wsl --shutdown` in PowerShell.

### WSL2 vs Docker Desktop — which to use?

| Scenario | Recommendation |
|---|---|
| Casual use on a personal Windows PC | Docker Desktop — simplest setup |
| Want to remove the Docker Desktop GUI | WSL2 + Docker Engine (this guide) |
| Dedicated always-on clinic server | Linux natively — no WSL complexity |

---

## Environment Variables

All configuration in `.env`. Copy `.env.example` as a starting point.

| Variable | Default | Description |
|---|---|---|
| `DB_NAME` | `medical_inventory` | PostgreSQL database name |
| `DB_USER` | `medinv` | PostgreSQL user |
| `DB_PASSWORD` | *(required)* | PostgreSQL password |
| `JWT_SECRET` | *(required)* | Access token signing key (min 32 chars) |
| `JWT_REFRESH_SECRET` | *(required)* | Refresh token key (different from JWT_SECRET) |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token lifetime |
| `NODE_ENV` | `production` | Set to `development` for verbose logging |
| `CORS_ORIGIN` | `*` | Allowed CORS origin — `*` for LAN access |
| `SESSION_TIMEOUT_MINUTES` | `30` | Idle minutes before auto-logout |
| `MAX_LOGIN_ATTEMPTS` | `5` | Failed attempts before account lockout |
| `LOCKOUT_MINUTES` | `15` | Lock duration |
| `SMTP_HOST` | *(optional)* | SMTP server hostname — leave blank to disable email |
| `SMTP_PORT` | `587` | SMTP port (587 for STARTTLS, 465 for SSL) |
| `SMTP_USER` | *(optional)* | SMTP username / email address |
| `SMTP_PASS` | *(optional)* | SMTP password |
| `SMTP_FROM` | `S.H.I.T. <noreply@clinic.local>` | From address shown on emails |
| `APP_URL` | `http://localhost:3000` | Base URL used in email links |
| `REPORT_TIMEZONE` | `UTC` | Timezone for weekly report schedule (IANA name) |

> **Never commit `.env` to version control.** It is excluded by `.gitignore`.

---

## Email Notifications Setup

### Gmail (App Password)

1. Enable 2-Step Verification on your Google account
2. Go to **Google Account → Security → App passwords**
3. Generate an app password for "Mail"
4. Add to `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx   # the 16-char app password
SMTP_FROM=S.H.I.T. <your@gmail.com>
APP_URL=http://192.168.1.100:3000
```

### Outlook / Microsoft 365

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your@clinic.com
SMTP_PASS=your_password
```

### Weekly report timezone

```env
REPORT_TIMEZONE=Australia/Sydney   # or America/New_York, Europe/London, etc.
```

Reports fire every **Monday at 8am** in the configured timezone.

---

## Remote Updates

### Windows (PowerShell / RDP)

```powershell
cd C:\MedInventory
powershell -ExecutionPolicy Bypass -File update.ps1

# Skip git pull (if files were manually copied):
powershell -ExecutionPolicy Bypass -File update.ps1 -SkipGitPull
```

### Linux / macOS

```bash
cd /opt/medinv && bash update.sh
```

### WSL2

```bash
# In WSL terminal
cd ~/medical-inventory && bash update.sh
```

Both scripts: backup DB → pull latest code → rebuild containers → health check.

---

## Connecting Multiple Devices

All API calls use relative URLs — the nginx container proxies `/api/*` internally. No configuration changes are needed when connecting from a new device.

**Find your server IP:**
- Windows: `ipconfig` → IPv4 Address
- Linux/macOS: `ip addr` or `ifconfig`
- WSL2: `hostname -I` (inside WSL), then use the Windows host IP

**Connect from any browser:**
```
http://192.168.1.100:3000
```

---

## Backup & Restore

### Manual backup

```bash
docker exec medinv_postgres pg_dump -U medinv medical_inventory \
  | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore

```bash
gunzip -c backup_20260101.sql.gz \
  | docker exec -i medinv_postgres psql -U medinv medical_inventory
```

### Automated daily backups (Linux crontab)

```cron
0 2 * * * docker exec medinv_postgres pg_dump -U medinv medical_inventory \
  | gzip > /opt/medinv/backups/daily_$(date +\%Y\%m\%d).sql.gz
```

---

## Development Setup

### Backend

```bash
cd backend
cp ../.env.example ../.env
# Edit: DB_HOST=localhost, NODE_ENV=development
npm install
npm run dev    # ts-node-dev, restarts on save
```

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:4000" > .env.local
npm run dev    # Vite at http://localhost:5173
```

### Tests

```bash
cd backend && npm test    # creates/destroys medical_inventory_test DB
cd frontend && npm test
```

### Dev with Docker (recommended)

```bash
docker compose -f docker-compose.dev.yml up
```

Source files are mounted as volumes — TypeScript changes rebuild automatically.

---

## Project Structure

```
medical-inventory/
│
├── docker-compose.yml              # Production: postgres + backend + frontend (nginx)
├── docker-compose.dev.yml          # Dev: live-reload volumes
├── .env.example                    # Template — copy to .env
├── version.json                    # App version (read by /api/system/version)
├── update.ps1 / update.sh          # Remote update scripts
│
├── backend/
│   └── src/
│       ├── app.ts                  # Express setup (routes, middleware)
│       ├── index.ts                # Entry point + cron job start
│       ├── db.ts                   # PostgreSQL pool + withTransaction()
│       ├── schema.sql              # Complete DB schema (single source of truth)
│       ├── seed.sql                # Demo data
│       ├── jobs/
│       │   └── scheduledReports.ts # Weekly email report (node-cron)
│       ├── middleware/
│       │   ├── auth.ts             # JWT verify, requireRole helpers
│       │   └── errorHandler.ts
│       ├── routes/
│       │   ├── auth.ts             # Login, refresh, 2FA (TOTP), profile
│       │   ├── inventory.ts        # CRUD, adjust, wastage, bulk ops, CSV
│       │   ├── requests.ts         # Doctor requests, nurse fulfilment, quick charge, patient ledger
│       │   ├── templates.ts        # Saved order/charge templates (all roles)
│       │   ├── returns.ts          # Returns to supplier
│       │   ├── budgets.ts          # Monthly category budgets
│       │   ├── stocktakes.ts       # Stocktake sessions + CSV export
│       │   ├── invoices.ts         # Supplier invoices + Xero export
│       │   ├── reports.ts          # Usage, wastage, patient ledger, movements
│       │   ├── users.ts            # User management (admin)
│       │   ├── audit.ts            # Audit log
│       │   ├── categories.ts       # Category CRUD
│       │   ├── suppliers.ts        # Supplier CRUD
│       │   └── system.ts           # Version, health, status
│       └── utils/
│           ├── audit.ts            # logAudit() helper
│           └── email.ts            # Nodemailer wrapper + typed email functions
│
├── frontend/
│   └── src/
│       ├── App.tsx                 # Router + all page routes
│       ├── context/
│       │   ├── AuthContext.tsx     # Auth state, login/logout, token storage
│       │   └── ThemeContext.tsx    # Dark mode + accent colour + notification sound
│       ├── hooks/
│       │   ├── useBarcodeScan.ts   # USB/Bluetooth scanner detection
│       │   ├── useDebounce.ts
│       │   ├── useIdleTimeout.ts   # Session idle detection
│       │   ├── useKeyboardShortcuts.ts
│       │   └── useNotifications.ts # Polling + Web Audio beep
│       ├── components/
│       │   ├── ItemSearchSelect.tsx    # Fuzzy-search item combobox
│       │   ├── KeyboardHelpOverlay.tsx # ? shortcut help modal
│       │   ├── WastageModal.tsx        # Record wastage modal
│       │   └── ...                    # Modal, Badge, Sidebar, etc.
│       └── pages/
│           ├── DoctorOrder.tsx    # POS order screen (doctors) + templates
│           ├── POS.tsx            # Quick charge screen (nurses) + templates
│           ├── RequestDetail.tsx  # Request detail + FEFO + copyable note
│           ├── Returns.tsx        # Returns to supplier
│           ├── Reports.tsx        # All reports incl. wastage + patient ledger
│           ├── Profile.tsx        # My Account: name/email, 2FA, theme, notifications
│           └── ...
│
├── installer/
│   ├── install.ps1     # Windows installer script
│   ├── uninstall.ps1
│   └── MedInventory.iss  # Inno Setup → builds Setup_MedInventory.exe
│
└── scripts/
    └── take-screenshots.mjs  # Puppeteer screenshot script for docs
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | React + TypeScript + Vite | 18 / 5 / 5 |
| Styling | Tailwind CSS | 3 |
| Server state | TanStack Query | 5 |
| Forms | React Hook Form | 7 |
| Charts | Recharts | 2 |
| Routing | React Router | 6 |
| PWA | vite-plugin-pwa + Workbox | — |
| Backend | Express + TypeScript / Node.js | 4 / 20 |
| Database | PostgreSQL | 16 |
| Validation | Zod | 3 |
| Auth | JWT + bcrypt + TOTP (otplib) | — |
| Email | Nodemailer | 6 |
| Scheduler | node-cron | 3 |
| Containerisation | Docker + Compose + nginx | — |
| Testing | Vitest + supertest + RTL | — |

All dependencies are free and open-source. No paid services, no telemetry, no external API calls.

---

## Licence

MIT — use freely, modify freely, deploy on your own infrastructure.
