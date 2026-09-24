@echo off
rem Stop AI Comic Workbench local server
setlocal
set "PIDFILE=%~dp0server.pid"
if not exist "%PIDFILE%" (
  echo [Stop] server.pid not found. Server may already be stopped.
  pause
  exit /b 0
)
set /p SRVPID=<"%PIDFILE%"
echo [Stop] Killing server process PID %SRVPID% ...
taskkill /PID %SRVPID% /F >nul 2>&1
if %errorlevel%==0 (
  echo [Stop] Server stopped.
) else (
  echo [Stop] Process %SRVPID% not running (already stopped?).
)
del "%PIDFILE%" >nul 2>&1
echo [Stop] Done.
pause
