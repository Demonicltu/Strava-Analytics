@echo off
REM Fast mode — fetch + crunch + AI + push to Strava
cd /d "%~dp0"
node dist\strava.cjs %*
pause
