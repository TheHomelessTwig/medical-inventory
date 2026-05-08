@echo off
echo ======================================
echo   MedInventory - Setup (Windows)
echo ======================================

REM Copy .env if not exists
if not exist .env (
  copy .env.example .env
  echo [OK] Created .env from .env.example
  echo.
  echo  WARNING: Edit .env and change ALL secrets before production!
  echo.
)

REM Check Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [FAIL] Docker not found. Please install Docker Desktop.
  pause
  exit /b 1
)
echo [OK] Docker found

echo.
echo Building and starting services...
docker compose up --build -d

echo.
echo Waiting for services...
timeout /t 10 /nobreak >nul

echo.
echo ======================================
echo   MedInventory is running!
echo ======================================
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:4000
echo.
echo   Accounts (CHANGE PASSWORDS NOW):
echo     Admin:  admin@clinic.local / Admin123!
echo     Doctor: doctor@clinic.local / Doctor123!
echo     Nurse:  nurse@clinic.local / Nurse123!
echo.
echo   To stop:  docker compose down
echo ======================================
pause
