@echo off
REM Bulk fetch 2 years of Strava history (no AI)
cd /d "%~dp0"
node dist\bulk.cjs %*
pause
