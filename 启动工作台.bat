@echo off
title AI ManJu Workbench Server
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
) else if exist "C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" (
  "C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" server.js
) else (
  echo [ERROR] Node.js not found. Please install Node.js first.
  pause
)
