@echo off
REM Weekly training digest + overtraining check
cd /d "%~dp0"
node dist\digest.cjs %*
pause
