#!/usr/bin/env bash
# MedInventory Updater — Linux / macOS
# Run from the installation directory:  bash update.sh
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$INSTALL_DIR"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "  ${CYAN}►${NC} $*"; }
ok()    { echo -e "  ${GREEN}✓${NC} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $*"; }
err()   { echo -e "  ${RED}✗${NC} $*"; exit 1; }

VERSION_FILE="$INSTALL_DIR/version.json"
CURRENT=$([ -f "$VERSION_FILE" ] && python3 -c "import json,sys; print(json.load(open('$VERSION_FILE'))['version'])" 2>/dev/null || echo "unknown")

echo ""
echo -e "  ${CYAN}MedInventory Updater${NC}"
echo -e "  Current version: $CURRENT"
echo -e "  Install path:    $INSTALL_DIR"
echo ""

read -p "  Proceed with update? (Y/n): " CONFIRM
[[ "$CONFIRM" =~ ^[Nn]$ ]] && echo "  Cancelled." && exit 0

# ── 1. Pre-update backup ──────────────────────────────────────────────────────
BACKUP_DIR="$INSTALL_DIR/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M)
BACKUP_FILE="$BACKUP_DIR/pre_update_${TIMESTAMP}.sql.gz"

step "Creating pre-update database backup..."
if docker exec medinv_postgres pg_dump -U medinv medical_inventory 2>/dev/null | gzip > "$BACKUP_FILE"; then
    ok "Backup saved: $BACKUP_FILE"
else
    warn "Backup failed (container may not be running) — continuing"
    rm -f "$BACKUP_FILE"
fi

# ── 2. Pull latest code ───────────────────────────────────────────────────────
if [ -d ".git" ] && command -v git &>/dev/null; then
    step "Pulling latest changes..."
    if git pull; then
        ok "Code updated"
    else
        warn "git pull failed — continuing with current files"
    fi
else
    warn "Not a git repo or git not available — skipping pull"
fi

# ── 3. Rebuild and restart ────────────────────────────────────────────────────
step "Building containers..."
docker compose build || err "Build failed"
ok "Build complete"

step "Restarting services..."
docker compose up -d || err "docker compose up failed"

# ── 4. Health check ───────────────────────────────────────────────────────────
step "Waiting for health check..."
TIMEOUT=60; ELAPSED=0; HEALTHY=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    sleep 3; ELAPSED=$((ELAPSED+3))
    if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
        HEALTHY=1; break
    fi
done

# ── 5. Done ───────────────────────────────────────────────────────────────────
NEW=$([ -f "$VERSION_FILE" ] && python3 -c "import json; print(json.load(open('$VERSION_FILE'))['version'])" 2>/dev/null || echo "unknown")

echo ""
if [ "$HEALTHY" -eq 1 ]; then
    echo -e "  ${GREEN}✓ Update complete! $CURRENT → $NEW${NC}"
    echo -e "  ${GREEN}✓ http://localhost:3000 is up${NC}"
else
    warn "Services may still be starting — check http://localhost:3000"
fi
echo ""
