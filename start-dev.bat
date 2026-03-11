@echo off
setlocal

set "ROOT=%~dp0"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>nul

echo Starting AI Memory Vault services...
echo.

start "AI Memory Vault - Backend" cmd /k "cd /d "%ROOT%backend" && bun run dev:api"
start "AI Memory Vault - Worker" cmd /k "cd /d "%ROOT%backend" && bun run dev:worker"
start "AI Memory Vault - Frontend" cmd /k "cd /d "%ROOT%frontend" && bun run dev"

echo Backend, worker, and frontend launch commands have been started in separate terminals.
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo Worker:   process-file queue listener (BullMQ)

endlocal
