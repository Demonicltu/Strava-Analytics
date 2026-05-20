@echo off
REM AI fitness trend comparison
cd /d "%~dp0"
node dist\compare.cjs %*
pause
