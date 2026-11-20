@echo off
chcp 65001 >nul
rem Ftiaxnei tis fotografies tou dashboard kai tis stelnei sto tablet (to tablet prepei na einai syndedemeno me USB).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\dashboard-photos-sync.ps1" -Push
echo.
pause
