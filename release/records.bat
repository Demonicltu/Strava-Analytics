@echo off
REM Personal records tracker
cd /d "%~dp0"
node dist\records.cjs %*
pause
