#!/bin/bash
# MedInventory — First-time setup helper
set -e

echo "======================================"
echo "  MedInventory — Setup"
echo "======================================"

# Copy .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[✓] Created .env from .env.example"
  echo ""
  echo "  ⚠  IMPORTANT: Edit .env and change ALL secrets before production use!"
  echo "     - DB_PASSWORD"
  echo "     - JWT_SECRET (run: openssl rand -hex 64)"
  echo "     - JWT_REFRESH_SECRET (run: openssl rand -hex 64)"
  echo ""
fi

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "[✗] Docker not found. Please install Docker Desktop."
  exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  echo "[✗] Docker Compose not found."
  exit 1
fi

echo "[✓] Docker found"

# Build and start
echo ""
echo "Building and starting services..."
docker compose up --build -d

echo ""
echo "Waiting for services to be ready..."
sleep 5

# Health check
for i in {1..10}; do
  if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
    echo "[✓] Backend is healthy"
    break
  fi
  echo "  Waiting... ($i/10)"
  sleep 3
done

echo ""
echo "======================================"
echo "  MedInventory is running!"
echo "======================================"
echo ""
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:4000"
echo "  Health:    http://localhost:4000/health"
echo ""
echo "  Default accounts (CHANGE PASSWORDS IMMEDIATELY):"
echo "    Admin:  admin@clinic.local  /  Admin123!"
echo "    Doctor: doctor@clinic.local /  Doctor123!"
echo "    Nurse:  nurse@clinic.local  /  Nurse123!"
echo ""
echo "  To stop:    docker compose down"
echo "  To view logs: docker compose logs -f"
echo "======================================"
