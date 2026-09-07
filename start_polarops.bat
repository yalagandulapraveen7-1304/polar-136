@echo off
title PolarOPS // NOVARA Polar Station EMS
echo ========================================================
echo   POLAROPS // NOVARA AI Polar Microgrid Digital Twin
echo ========================================================
echo.
echo Starting FastAPI Backend & Real-Time Telemetry Stream...
start "PolarOPS Server (Port 8000)" cmd /k "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul

echo Opening browser at http://localhost:8000...
start http://localhost:8000

echo.
echo [SUCCESS] PolarOPS Digital Twin is running!
echo Dashboard: http://localhost:8000
echo WebSocket: ws://localhost:8000/ws/telemetry
echo.
pause
