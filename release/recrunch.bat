@echo off
REM Re-crunch all output files (pick up new metrics, no API calls)
cd /d "%~dp0"
node dist\recrunch.cjs %*
pause
