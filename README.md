# S.H.I.T.
### Sam's Helpful Inventory Tracker

A self-contained, open-source inventory management system built for small-to-medium medical practices. Runs entirely on your own hardware — no cloud accounts, no subscriptions, no external dependencies.

```mermaid
graph LR
    Browser["🌐 Browser<br/>http://server-ip:3000"]

    subgraph Docker["Docker (single machine)"]
        direction LR
        nginx["nginx<br/>(React SPA)"]
        api["Express API<br/>(Node.js :4000)"]
        db[("PostgreSQL 16<br/>named volume")]
        uploads[("Uploads<br/>named volume")]
    end

    Browser -->|"port 3000"| nginx
    nginx -->|"/api/* proxy"| api
    api -->|"pg queries"| db
    api -->|"files"| uploads
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
![Login page showing S.H.I.T. branding with demo account credentials](docs/screenshots/login.png)

### Dashboard
![Dashboard with KPI cards, low-stock alert, and recent activity feed](docs/screenshots/dashboard.png)

### Dashboard (Dark Mode)
![Dashboard in dark mode with KPI cards and stock value charts](docs/screenshots/dashboard-dark.png)

### Inventory
![Inventory list showing items, categories, on-hand quantities, prices and expiry status](docs/screenshots/inventory.png)

### Doctor — New Order (POS Screen)
![Doctor POS-style order screen with item grid, category pills, basket, and priority selector](docs/screenshots/doctor-order.png)

### Nurse — Quick Charge (POS Screen)
![Nurse quick charge screen with item grid, internal prices, doctor selector, and basket](docs/screenshots/quick-charge.png)

### Requests (Admin view)
![Stock requests list with status badges, priority sorting, and fulfilment actions](docs/screenshots/requests.png)

### Requests (Nurse view)
![Nurse requests view showing pending requests sorted by priority with accept and fulfil buttons](docs/screenshots/requests-nurse.png)

### Reports — Overview
![Reports overview with stock value KPIs, low-stock list, and category pie chart](docs/screenshots/reports.png)

### Returns to Supplier
![Supplier returns list with draft/confirmed status badges](docs/screenshots/returns.png)

### Stocktakes
![Stocktake sessions list with progress indicators](docs/screenshots/stocktakes.png)

### Invoices
![Supplier invoice list with posted/unposted status](docs/screenshots/invoices.png)

### Users (Admin)
![User management with role badges and action buttons](docs/screenshots/users.png)

### Audit Log
![Immutable audit log with user, action, timestamp, and before/after values](docs/screenshots/audit-log.png)

### My Account (Profile)
![User profile page with 2FA setup, dark mode toggle, and accent colour picker](docs/screenshots/profile.png)

### Settings (Admin)
![Admin settings showing system info, email SMTP config, security thresholds, and backup controls](docs/screenshots/settings.png)

### Settings — Email Configuration
![Email SMTP settings panel with host, port, credentials, from address, app URL, and test send button](docs/screenshots/settings-email.png)

---

## What It Does

| Capability | Description |
|---|---|
| **Stock tracking** | Real-time quantities, reorder alerts, expiry warnings, batch/lot numbers |
| **Doctor ordering** | POS-style grid to request stock from nurses — with saved templates |
| **Nurse quick charge** | Charge stock directly against a patient/doctor — with saved templates |
| **Fulfilment workflow** | Nurses accept → fulfil → doctor gets a copyable clinical note + printable labels |
| **Dispensing labels** | PDF label sheets (Avery L7163) with patient, drug, batch, expiry, nurse, doctor |
| **Wastage recording** | Record dropped, contaminated, or unused stock with reason tracking |
| **Returns to supplier** | Draft → confirm workflow that restores stock levels |
| **Purchase orders** | Full PO workflow: draft → sent → received; auto-emails supplier; updates stock |
| **Auto reorder** | Per-item flag: automatically creates a draft PO when stock hits the reorder threshold |
| **Stock transfers** | Move stock between clinic sites with a dispatch → receive workflow and full audit trail |
| **Recall management** | Record supplier recalls, quarantine affected batches, export patient impact list |
| **Stocktakes** | Full/cycle/partial stocktakes with printable count sheets; scheduled auto-creation |
| **Supplier invoices** | Record incoming stock and update levels in one step |
| **Reports** | Usage, wastage, patient ledger, revenue, budgets, BAS/GST — all with CSV export |
| **GST / BAS export** | Australian quarterly BAS summary: purchases, supplies, input tax credits, net GST |
| **Xero export** | Invoice data in Xero bank transactions format |
| **Budget tracking** | Monthly spend vs budget per category with dashboard widget |
| **Email notifications** | New requests, fulfilments, expiry alerts, recalls, account lockouts, weekly summaries |
| **Outbound webhooks** | Push events to any HTTPS endpoint; HMAC-signed; automatic retry with backoff |
| **Barcode scanning** | USB/Bluetooth scanner support on POS and inventory screens |
| **Controlled drug register** | Schedule 8 / S4 flag, witness fields on dispensing, CSV register export |
| **Multi-site support** | Assign staff and inventory to locations; stock transfers between sites |
| **Item photos** | Upload a photo per item for shelf identification |
| **File attachments** | Attach PDFs/images to invoices, returns, and purchase orders |
| **PWA + offline queue** | Installable on tablets/phones; fulfilments queued offline, synced when reconnected |
| **2FA** | TOTP two-factor authentication (Google Authenticator / Authy) |
| **Session management** | View and revoke active login sessions per user; admin can force sign-out |
| **Role granularity** | 6 roles: Admin, Doctor, Nurse, Practice Manager, Receptionist, Locum Doctor |
| **Dark mode + theming** | Full dark mode; 8 accent colour presets + custom colour picker |
| **Custom branding** | Set your clinic's own display name and tagline from Settings |
| **Data retention** | Configurable audit log archiving and patient data anonymisation (Privacy Act) |
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

Six roles with distinct access levels:

| Capability | Admin | Doctor | Nurse | Practice Mgr | Receptionist | Locum Dr |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Inventory (view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Inventory (edit/adjust/wastage) | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Item photos | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| New Order (POS) | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Quick Charge (POS) | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Order/charge templates | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| Requests (view) | ✓ | own | ✓ | ✓ | ✗ | own |
| Requests (fulfil/accept) | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Stocktakes | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Stock transfers | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Returns to supplier | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Purchase orders | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Recalls | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Invoices | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Reports | ✓ | ✓* | ✓* | ✓ | ✗ | ✓* |
| Patient Ledger | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Budgets | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Users / Audit / Settings | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Webhooks / Retention | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

\* Limited to data relevant to their own activity. Locum accounts have an optional expiry date.

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

### Dispensing Labels (PDF)
After any fulfilment a **🏷️ Print Labels** button appears on the receipt. It opens an A4 PDF sheet of adhesive labels (Avery L7163 / 99×57mm, 10 per page) pre-filled with:
- Practice name
- Patient name and reference
- Drug name, quantity dispensed
- Batch number and expiry date
- Dispensing nurse and doctor name
- Date dispensed

Labels can also be generated from the API directly for integrations.

### Recall Management
When a supplier issues a batch recall:
1. **Recalls → New Recall** — enter the title, severity, and affected batch numbers
2. The system immediately finds all matching batches in your stock and all patients who received them
3. **Quarantine** writes off all affected stock in one click and creates adjustment records
4. **Export Patient List** generates a CSV of every dispensing event for regulatory submission
5. Admins are emailed immediately on recall creation with a severity-coloured alert

### Stock Transfers
Move stock between clinic locations with a full paper trail:
1. **Stock Transfers → New Transfer** — choose source and destination site, add items
2. **Dispatch** — deducts stock from the source site
3. **Receive** — adds stock at the destination site
4. Both steps create adjustment records in the audit log

### Auto Reorder
Enable per item in **Inventory → Edit Item → Auto Reorder**:
- When stock falls to or below the reorder threshold during a fulfilment, a draft PO is automatically created for the item's default supplier
- The `Reorder Quantity` field overrides the default (2× threshold)
- Skips if an open PO for that item already exists
- Admin reviews and sends the PO when ready

### Scheduled Stocktakes
Configure recurring stocktakes so sessions create themselves automatically:
- **Settings → Stocktake Schedules**: set name, frequency (weekly/monthly/quarterly), day, and type
- On the scheduled date, the system creates the stocktake session and emails nursing staff
- Nurses log in and count — no manual session creation needed

### GST / BAS Export (Australian practices)
**Reports → BAS / GST** generates a quarterly summary:
- **Taxable purchases**: from posted invoices (G10/G11)
- **Taxable supplies**: from dispensing charges with GST-applicable items
- **Input tax credits** (G20) and **GST collected**
- **Net GST payable** = GST collected − input tax credits
- Monthly breakdown table + CSV export for BAS lodgement

### Outbound Webhooks
Push real-time events to any HTTPS endpoint (practice management software, Zapier, custom scripts):
- **Settings → Webhooks**: add URL, select events, get a signing secret
- Payloads are HMAC-SHA256 signed (`X-SHIT-Signature` header) for verification
- Automatic retry with exponential backoff (1m → 5m → 30m → 2h → 8h, max 5 attempts)
- **Test ping** button to verify connectivity before going live

**Available events:**
`stock.low` · `stock.expired` · `request.created` · `request.fulfilled` · `invoice.posted` · `purchase_order.received` · `stocktake.completed` · `recall.created` · `transfer.received`

### Item Photos
Upload a photo to any inventory item (JPEG, PNG, WebP):
- Admin: **Inventory → Edit Item → Upload Photo**
- Stored in the uploads volume alongside other attachments
- Helps nursing staff identify the correct item on the shelf, especially for similar-looking medications

### Automated Expiry Write-off
Every night at 1am the system scans for batches where `expiry_date < today` and `quantity > 0`:
- Creates `adjustment_type = 'expiry'` records for each expired batch
- Zeroes the batch quantity and deducts from the item's stock level
- Emails admins a summary of what was written off
- Records appear in the audit log and wastage report

### Dark Mode & Theming
- **Dark mode toggle** in the sidebar (bottom) and My Account page
- **8 accent colour presets**: Blue, Indigo, Violet, Rose, Amber, Emerald, Cyan, Slate
- **Custom colour picker** for any hex value
- Admin can set the clinic-wide colour in Settings → Clinic Theme
- Each user can override on their own profile page
- All preferences saved to browser localStorage

### Custom Branding
Set your practice's own name in **Settings → Branding**:
- **Display name** — shown large on the login screen and in the sidebar
- **Tagline** — smaller subtitle; leave blank to hide
- Changes take effect immediately for all users without a restart

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

Most settings are now configurable from the **Settings** page in the app. Only infrastructure secrets that must exist before the database is reachable belong in `.env`.

Copy `.env.example` as a starting point. **Minimum required values:**

```env
DB_PASSWORD=choose_a_strong_password
JWT_SECRET=at_least_32_random_characters
JWT_REFRESH_SECRET=different_32_random_characters
```

**All `.env` variables:**

| Variable | Default | Notes |
|---|---|---|
| `DB_NAME` | `medical_inventory` | PostgreSQL database name |
| `DB_USER` | `medinv` | PostgreSQL user |
| `DB_PASSWORD` | *(required)* | PostgreSQL password |
| `JWT_SECRET` | *(required)* | Access token signing key — **never store in DB** |
| `JWT_REFRESH_SECRET` | *(required)* | Refresh token key — **never store in DB** |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token lifetime |
| `NODE_ENV` | `production` | Set `development` for verbose logging |
| `CORS_ORIGIN` | `*` | Restrict to `http://192.168.x.x:3000` for production |
| `UPLOAD_DIR` | `/uploads` | File attachment storage path in container |
| `SMTP_HOST` | — | *Fallback* — configure via Settings page instead |
| `SMTP_PORT` | `587` | *Fallback* |
| `SMTP_USER` | — | *Fallback* |
| `SMTP_PASS` | — | *Fallback* |
| `SMTP_FROM` | `noreply@clinic.local` | *Fallback* |
| `APP_URL` | `http://localhost:3000` | *Fallback* |
| `REPORT_TIMEZONE` | `UTC` | *Fallback* — configure via Settings → Timezone |
| `MAX_LOGIN_ATTEMPTS` | `5` | *Fallback* — configure via Settings → Security |
| `LOCKOUT_MINUTES` | `15` | *Fallback* — configure via Settings → Security |
| `SESSION_TIMEOUT_MINUTES` | `30` | *Fallback* — configure via Settings → Security |
| `BACKUP_DIR` | `/opt/medinv/backups` | *Fallback* — configure via Settings → Backup |

> Settings-page values always take priority over env vars. Env vars serve as fallback defaults when the DB value is null (e.g. before first login).

> **Never commit `.env` to version control.** It is excluded by `.gitignore`.

---

## Admin Settings (UI Configuration)

Most configuration is now done from **Settings** inside the app — no `.env` editing required after the initial setup. Only the secrets below must remain in `.env`.

**Settings → Email (SMTP)**
- SMTP host, port, TLS toggle, username, password, from address
- App URL (used in email links)
- **Send Test Email** button — verifies connectivity and sends a test to your account

**Settings → Security**
- Session idle timeout
- Max failed login attempts before lockout
- Lockout duration

**Settings → Timezone**
- IANA timezone for all scheduled jobs (weekly report, expiry alerts, backup, etc.)

**Settings → Automatic Database Backup**
- Enable/disable the built-in backup cron
- Daily or weekly schedule (runs at 2:00 AM in the configured timezone)
- Retention period (days to keep old backups)
- Backup directory path

**Run Backup Now** — triggers an immediate manual backup without waiting for the schedule.

---

## Email Notifications Setup

Email is configured entirely from the **Settings → Email (SMTP)** page — no `.env` editing needed.

### Gmail (App Password)

1. Enable 2-Step Verification on your Google account
2. Go to **Google Account → Security → App passwords**
3. Generate an app password for "Mail"
4. In S.H.I.T.: **Settings → Email → SMTP Host**: `smtp.gmail.com`, **Port**: `587`, **Username**: your Gmail address, **Password**: the 16-character app password

### Outlook / Microsoft 365

**Settings → Email**: host `smtp.office365.com`, port `587`, enter your Microsoft 365 credentials.

### After configuring

Click **Send Test Email** to verify the settings immediately — a test message is sent to your account. You don't need to restart the application.

### Timezone for scheduled jobs

**Settings → Timezone** — enter an IANA timezone string.

Scheduled jobs use the configured timezone:

| Job | Schedule |
|---|---|
| Weekly usage + low-stock report | Monday 08:00 |
| Daily expiry alerts | Daily 08:00 |
| Nightly expired-batch write-off | Daily 01:00 |
| Nightly data retention / archiving | Daily 03:00 |
| Scheduled stocktake creation | Daily 07:00 |
| Weekly backup integrity check | Sunday 04:00 |
| Webhook retry queue | Every 2 minutes |

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

### Built-in backup (all platforms)

Enable automatic backups from **Settings → Automatic Database Backup**:
- Toggle **Enable automatic backups**
- Choose **Daily** (2:00 AM) or **Weekly** (Sunday 2:00 AM)
- Set retention period and backup directory
- Click **Run Backup Now** for an immediate manual backup

The backup job runs inside the Docker container and creates compressed `backup_YYYYMMDD_HHMM.sql.gz` files.

### Windows — Task Scheduler backup

For an additional backup from Windows (e.g. to a network share), use the included `backup.ps1`:

```powershell
# Manual run
powershell -ExecutionPolicy Bypass -File backup.ps1

# Schedule with Task Scheduler (PowerShell Admin):
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File C:\MedInventory\backup.ps1 -BackupDir D:\NetworkShare\MedInvBackups"
$trigger = New-ScheduledTaskTrigger -Daily -At "2:00AM"
Register-ScheduledTask `
    -TaskName "SHIT-Inventory-Backup" `
    -Action $action -Trigger $trigger `
    -Principal (New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest)
```

`backup.ps1` accepts `-BackupDir` and `-RetainDays` parameters. It prunes old backups automatically.

### WSL2 — cron inside WSL

```bash
# In WSL terminal: crontab -e
0 2 * * * docker exec medinv_postgres pg_dump -U medinv medical_inventory \
  | gzip > ~/medical-inventory/backups/daily_$(date +\%Y\%m\%d).sql.gz
```

Or use Windows Task Scheduler to trigger WSL at 2am:
```powershell
# Task Scheduler action:
wsl -d Ubuntu -- bash -c "docker exec medinv_postgres pg_dump -U medinv medical_inventory | gzip > ~/medical-inventory/backups/daily_\$(date +%%Y%%m%%d).sql.gz"
```

### Linux — crontab

```cron
0 2 * * * docker exec medinv_postgres pg_dump -U medinv medical_inventory \
  | gzip > /opt/medinv/backups/daily_$(date +\%Y\%m\%d).sql.gz
```

### Restore

```bash
gunzip -c backup_20260101.sql.gz \
  | docker exec -i medinv_postgres psql -U medinv medical_inventory
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
│       ├── app.ts                  # Express setup (all routes, middleware)
│       ├── index.ts                # Entry point, migration runner, cron start
│       ├── db.ts                   # PostgreSQL pool + withTransaction()
│       ├── schema.sql              # Complete DB schema (fresh installs)
│       ├── seed.sql                # Demo data
│       ├── db/
│       │   ├── migrate.ts          # Migration runner (runs on startup)
│       │   └── migrations/         # Incremental SQL files (0001–0021)
│       ├── jobs/
│       │   ├── scheduledReports.ts # Weekly report, daily expiry alerts, backup check
│       │   ├── retentionJob.ts     # Nightly audit log archiving + patient anonymisation
│       │   ├── expiryWriteoff.ts   # Nightly expired-batch write-off
│       │   ├── stocktakeScheduler.ts # Scheduled stocktake auto-creation
│       │   └── webhookRetry.ts     # Webhook delivery retry queue (every 2 min)
│       ├── middleware/
│       │   ├── auth.ts             # JWT verify, requireRole, locum expiry check
│       │   └── errorHandler.ts
│       ├── routes/
│       │   ├── auth.ts             # Login, refresh, 2FA, profile, session management
│       │   ├── inventory.ts        # CRUD, adjust, wastage, bulk ops, photos, CSV
│       │   ├── requests.ts         # Doctor requests, nurse fulfilment, quick charge, patient ledger
│       │   ├── templates.ts        # Saved order/charge templates (all roles)
│       │   ├── returns.ts          # Returns to supplier
│       │   ├── transfers.ts        # Stock transfers between sites
│       │   ├── recalls.ts          # Recall management + patient impact report
│       │   ├── purchaseOrders.ts   # PO workflow (draft → sent → received)
│       │   ├── budgets.ts          # Monthly category budgets
│       │   ├── stocktakes.ts       # Stocktake sessions + CSV export
│       │   ├── stocktakeSchedules.ts # Scheduled stocktake configuration
│       │   ├── invoices.ts         # Supplier invoices + Xero export
│       │   ├── reports.ts          # Usage, wastage, patient ledger, BAS, movements
│       │   ├── labels.ts           # Dispensing label PDF generation
│       │   ├── attachments.ts      # File uploads for invoices/returns/POs/items
│       │   ├── sites.ts            # Multi-site management
│       │   ├── retention.ts        # Data retention config + DB size monitor
│       │   ├── webhooks.ts         # Outbound webhook subscriptions + delivery log
│       │   ├── users.ts            # User management (admin + practice_manager)
│       │   ├── audit.ts            # Audit log
│       │   ├── categories.ts       # Category CRUD
│       │   ├── suppliers.ts        # Supplier CRUD
│       │   └── system.ts           # Version, health, status, branding config
│       └── utils/
│           ├── audit.ts            # logAudit() helper
│           ├── email.ts            # Nodemailer wrapper + typed email functions
│           ├── webhooks.ts         # emitWebhookEvent() + HMAC signing + delivery
│           ├── autoReorder.ts      # checkAutoReorder() — auto-draft PO on low stock
│           └── pdfLabels.ts        # pdfkit label sheet generator
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
