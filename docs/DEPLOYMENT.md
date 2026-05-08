# S.H.I.T. — Deployment Guide

Everything you need to run S.H.I.T. in a clinic environment.

---

## Table of Contents

1. [Choosing a Deployment Method](#choosing-a-deployment-method)
2. [Windows — Installer (.exe)](#windows--installer-exe)
3. [Windows — Docker Desktop](#windows--docker-desktop)
4. [Windows — WSL2 (no Docker Desktop)](#windows--wsl2-no-docker-desktop)
5. [Linux — Native Docker](#linux--native-docker)
6. [macOS](#macos)
7. [Production Hardening](#production-hardening)
8. [HTTPS / TLS](#https--tls)
9. [Remote Updates](#remote-updates)

---

## Choosing a Deployment Method

| Method | Best for | Effort |
|---|---|---|
| **Windows installer (.exe)** | Clinics with a dedicated Windows PC | Lowest — double-click and done |
| **Windows + Docker Desktop** | Developers, personal machines | Low |
| **Windows + WSL2** | Remove Docker Desktop GUI; lighter footprint | Medium |
| **Linux server** | Dedicated always-on clinic server | Medium — cleanest for production |
| **macOS** | Development / Mac-based clinics | Low |

All methods produce the same result: the app running at `http://<server-ip>:3000`.

---

## Windows — Installer (.exe)

The Inno Setup installer automates everything:

1. Download or build `Setup_MedInventory_v1.1.0.exe` from `installer/output/`
2. Right-click → **Run as administrator**
3. Follow the wizard:
   - Docker Desktop is downloaded and installed if missing (~550MB)
   - Install directory: default `C:\MedInventory`
   - Secrets are generated automatically
4. The app starts, a desktop shortcut is created, and auto-start on boot is configured

**Building the installer:**
```
1. Install Inno Setup from https://jrsoftware.org/isdl.php
2. Open installer/MedInventory.iss
3. Build → Compile
4. Find Setup_MedInventory_v1.1.0.exe in installer/output/
```

---

## Windows — Docker Desktop

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git (optional — you can also download a ZIP)

### Steps

```powershell
# Clone (or download and extract the ZIP)
git clone https://github.com/TheHomelessTwig/medical-inventory.git
cd medical-inventory

# Configure
Copy-Item .env.example .env
notepad .env   # Set DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET

# Start
docker compose up --build -d

# Verify
Start-Process "http://localhost:3000"
```

### Auto-start on Windows boot

Docker Desktop has an option **"Start Docker Desktop when you log in"**. Once enabled, the containers start automatically if you add `restart: unless-stopped` (already set in `docker-compose.yml`).

---

## Windows — WSL2 (no Docker Desktop)

Use this to run Docker Engine directly inside WSL2 without the Docker Desktop GUI. Useful for keeping the system lighter on a dedicated clinic machine.

### Step 1 — Enable WSL2

In PowerShell (Admin):
```powershell
wsl --install
# Restart when prompted, then open Ubuntu from the Start menu
```

If WSL is already installed, ensure you have WSL2:
```powershell
wsl --set-default-version 2
```

### Step 2 — Install Docker Engine in WSL2

In the Ubuntu terminal:
```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg

curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo usermod -aG docker $USER
newgrp docker
```

### Step 3 — Copy project into WSL2 filesystem

**Run from the WSL2 filesystem, not `/mnt/c/...`** — cross-filesystem Docker I/O is very slow.

```bash
# Option A: Clone directly in WSL2
git clone https://github.com/TheHomelessTwig/medical-inventory.git ~/medical-inventory

# Option B: Copy from Windows
cp -r /mnt/d/Claude/Claudes\ Cave/medical-inventory ~/medical-inventory

cd ~/medical-inventory
cp .env.example .env
nano .env    # Set DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET
```

### Step 4 — Start the app

```bash
sudo service docker start
docker compose up --build -d
```

The app is now running. Your Windows browser can reach it at `http://localhost:3000`.

### Step 5 — LAN access (port forwarding)

WSL2 has its own internal IP that changes on each restart. To make the app reachable from other LAN devices, run this in **Windows PowerShell (Admin)**:

```powershell
$wslIp = (wsl hostname -I).Trim().Split()[0]

# Forward Windows port 3000 → WSL2 port 3000
netsh interface portproxy add v4tov4 `
    listenaddress=0.0.0.0 `
    listenport=3000 `
    connectaddress=$wslIp `
    connectport=3000

# Open Windows Firewall
netsh advfirewall firewall add rule `
    name="SHIT Inventory" `
    dir=in action=allow protocol=TCP localport=3000

Write-Host "✓ Forwarded: Windows:3000 → WSL2 $wslIp`:3000"
```

### Step 6 — Auto-start on Windows boot

**Option A — Task Scheduler script (works on all Windows versions)**

Save as `C:\startup-shit.ps1`:
```powershell
# Start Docker daemon and the app inside WSL2
wsl -d Ubuntu -- bash -c "sudo service docker start && cd ~/medical-inventory && docker compose up -d"

# Wait for WSL to be ready, then re-apply port forwarding
# (WSL2 IP changes on each reboot)
Start-Sleep -Seconds 8
$wslIp = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=3000 2>$null
netsh interface portproxy add v4tov4 `
    listenaddress=0.0.0.0 listenport=3000 `
    connectaddress=$wslIp connectport=3000
Write-Host "S.H.I.T. running at http://$($env:COMPUTERNAME)`:3000"
```

Register in Task Scheduler (PowerShell Admin):
```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File C:\startup-shit.ps1"

Register-ScheduledTask `
    -TaskName "SHIT-Inventory-WSL" `
    -Action $action `
    -Trigger (New-ScheduledTaskTrigger -AtStartup) `
    -Principal (New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest) `
    -Description "Starts S.H.I.T. inventory in WSL2"
```

**Option B — systemd inside WSL2 (Ubuntu 22.04+ recommended)**

Enable systemd by adding to `/etc/wsl.conf` (create if it doesn't exist):
```ini
[boot]
systemd=true
```

Restart WSL from Windows PowerShell: `wsl --shutdown`, then reopen Ubuntu.

Create the service:
```bash
sudo nano /etc/systemd/system/shit-inventory.service
```
```ini
[Unit]
Description=S.H.I.T. Inventory Management
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
sudo systemctl status shit-inventory
```

> With systemd enabled, Docker itself also starts automatically, so you don't need `sudo service docker start` separately.

### WSL2 memory tuning

Create (or edit) `%USERPROFILE%\.wslconfig` on the Windows side:
```ini
[wsl2]
memory=4GB      # Maximum RAM WSL2 can use
processors=2    # CPU cores allocated to WSL2
swap=2GB        # Swap space
```

Apply: `wsl --shutdown` in PowerShell, then reopen Ubuntu.

### Troubleshooting WSL2

**Port forwarding stops working after reboot:**
The WSL2 IP changes on each Windows restart. Re-run the port forwarding PowerShell commands (Step 5), or rely on the startup script (Step 6) to do this automatically.

**Cannot connect from other LAN devices:**
1. Confirm Windows Firewall rule exists: `netsh advfirewall firewall show rule name="SHIT Inventory"`
2. Confirm port proxy: `netsh interface portproxy show all`
3. Check WSL2 is running: `wsl -l --running`
4. Check the app is up inside WSL: `wsl -- curl http://localhost:3000/health`

**Docker: "permission denied" errors:**
```bash
sudo usermod -aG docker $USER
# Log out and back into WSL (or run: newgrp docker)
```

**WSL2 using too much RAM:**
Add the `.wslconfig` memory limit above, then `wsl --shutdown`.

---

## Linux — Native Docker

The cleanest option for a dedicated always-on clinic server.

### Install Docker

```bash
# Ubuntu 22.04 / 24.04
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### Deploy the app

```bash
sudo mkdir -p /opt/medinv
sudo chown $USER:$USER /opt/medinv

git clone https://github.com/TheHomelessTwig/medical-inventory.git /opt/medinv
cd /opt/medinv
cp .env.example .env
nano .env    # Set all required values

docker compose up --build -d
```

### Auto-start with systemd

```bash
sudo nano /etc/systemd/system/shit-inventory.service
```
```ini
[Unit]
Description=S.H.I.T. Inventory Management
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

### Open firewall (if ufw is active)

```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

---

## macOS

### Prerequisites
- [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)

### Steps

```bash
git clone https://github.com/TheHomelessTwig/medical-inventory.git
cd medical-inventory
cp .env.example .env
open -e .env    # Edit in TextEdit

docker compose up --build -d
open http://localhost:3000
```

### Auto-start (launchd)

Create `~/Library/LaunchAgents/com.medinv.shit.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.medinv.shit</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/docker</string>
    <string>compose</string>
    <string>-f</string>
    <string>/Users/YOUR_USERNAME/medical-inventory/docker-compose.yml</string>
    <string>up</string>
    <string>-d</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>WorkingDirectory</key>
  <string>/Users/YOUR_USERNAME/medical-inventory</string>
</dict>
</plist>
```
```bash
launchctl load ~/Library/LaunchAgents/com.medinv.shit.plist
```

---

## Production Hardening

For a clinic handling real patient data, consider these additional steps:

### Change default credentials

Immediately after first start:
- Log in as `admin@clinic.local` / `Admin123!` → change password
- Log in as `doctor@clinic.local` / `Doctor123!` → change password
- Log in as `nurse@clinic.local` / `Nurse123!` → change password
- Or delete the demo accounts and create real user accounts

### Strong secrets

Generate secrets with:
```bash
openssl rand -hex 64    # for JWT_SECRET and JWT_REFRESH_SECRET
openssl rand -hex 32    # for DB_PASSWORD
```

### Environment variables — full reference

| Variable | Default | Description |
|---|---|---|
| `DB_PASSWORD` | `changeme_strong_password` | PostgreSQL password |
| `JWT_SECRET` | `change_this_jwt_secret_minimum_32_chars` | Access token signing key |
| `JWT_REFRESH_SECRET` | `change_this_refresh_secret_min_32` | Refresh token signing key |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token lifetime |
| `CORS_ORIGIN` | `*` | Restrict to clinic IP for production |
| `SESSION_TIMEOUT_MINUTES` | `30` | Idle logout timeout |
| `MAX_LOGIN_ATTEMPTS` | `5` | Failed logins before account lockout |
| `LOCKOUT_MINUTES` | `15` | How long accounts stay locked |
| `SMTP_HOST` | *(empty)* | Leave blank to disable email |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | `true` for port 465 (SSL) |
| `SMTP_USER` | *(empty)* | SMTP authentication username |
| `SMTP_PASS` | *(empty)* | SMTP authentication password |
| `SMTP_FROM` | `noreply@clinic.local` | From address for outbound email |
| `REPORT_TIMEZONE` | `UTC` | IANA timezone for scheduled jobs (e.g. `Australia/Sydney`) |
| `UPLOAD_DIR` | `/uploads` | File attachment storage path in container |
| `BACKUP_DIR` | `/opt/medinv/backups` | Path scanned by weekly backup integrity check |

### File attachments storage

The `uploads_data` Docker volume stores file attachments (invoices, returns, purchase orders). It is separate from the database volume and should be included in backups:

```bash
# Backup uploads volume
docker run --rm \
  -v medinv_uploads_data:/uploads:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C / uploads
```

### Restrict CORS

Change `CORS_ORIGIN=*` to your clinic's server IP:
```env
CORS_ORIGIN=http://192.168.1.100:3000
```

### Enable 2FA for all admin accounts

My Account → Security → Enable 2FA. Require this for all users with admin access.

### Automated backups

```cron
# Daily at 2am — add to crontab with: crontab -e
0 2 * * * docker exec medinv_postgres pg_dump -U medinv medical_inventory \
  | gzip > /opt/medinv/backups/daily_$(date +\%Y\%m\%d).sql.gz

# Keep 30 days of backups
0 3 * * * find /opt/medinv/backups -name "daily_*.sql.gz" -mtime +30 -delete
```

### Restrict network access

If the server is on the same network as clinic workstations but not the public internet, no additional steps are needed. If it's internet-facing, add a firewall rule to restrict port 3000 to the clinic's IP range.

---

## HTTPS / TLS

The app runs on HTTP by default. For HTTPS, add a reverse proxy in front of nginx.

### Option A — Caddy (simplest, auto-certificates)

```bash
sudo apt install -y caddy

sudo nano /etc/caddy/Caddyfile
```
```
clinic.yourdomain.com {
    reverse_proxy localhost:3000
}
```
```bash
sudo systemctl reload caddy
```

Caddy automatically obtains and renews a Let's Encrypt certificate.

### Option B — nginx reverse proxy with Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

sudo nano /etc/nginx/sites-available/medinv
```
```nginx
server {
    listen 80;
    server_name clinic.yourdomain.com;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/medinv /etc/nginx/sites-enabled/
sudo certbot --nginx -d clinic.yourdomain.com
sudo systemctl reload nginx
```

Update `.env`:
```env
APP_URL=https://clinic.yourdomain.com
CORS_ORIGIN=https://clinic.yourdomain.com
```

### LAN-only HTTPS (self-signed)

For internal-only use without a public domain:

```bash
# Generate a self-signed cert
openssl req -x509 -newkey rsa:4096 -keyout clinic.key -out clinic.crt \
  -days 3650 -nodes -subj "/CN=192.168.1.100"
```

Then configure nginx to serve it. Browser will warn about the self-signed cert — you can add it as a trusted certificate on clinic devices.

---

## Remote Updates

### All platforms

```bash
# Linux / macOS
cd /opt/medinv && bash update.sh

# WSL2
wsl -- bash -c "cd ~/medical-inventory && bash update.sh"
```

### Windows

```powershell
cd C:\MedInventory
powershell -ExecutionPolicy Bypass -File update.ps1

# Skip git pull (manually copied files):
powershell -ExecutionPolicy Bypass -File update.ps1 -SkipGitPull
```

Both scripts:
1. Create a timestamped database backup in `backups/`
2. Pull latest code (if git repo)
3. Rebuild Docker containers
4. Restart services
5. Wait for health check to confirm the app is up

### Restoring from a backup

```bash
gunzip -c backups/pre_update_20260508_0900.sql.gz \
  | docker exec -i medinv_postgres psql -U medinv medical_inventory
```
