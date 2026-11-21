@echo off
setlocal
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-gui-windows.ps1"
if errorlevel 1 goto :error
goto :eof

:error
echo GUI startup failed. Review the error above.
pause
exit /b 1
