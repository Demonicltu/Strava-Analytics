@echo off
REM Generate static HTML dashboard
cd /d "%~dp0"
node dist\dashboard.cjs %*
pause
