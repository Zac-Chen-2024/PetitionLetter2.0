@echo off
cd /d "%~dp0backend"
set PATH=%~dp0python;%PATH%
rem Portable package is single-user: no workspace tokens (see Doc M5)
if not defined AUTH_DISABLED set AUTH_DISABLED=true

echo.
echo   ==========================================
echo     PetitionLetter - EB-1A Petition System
echo   ==========================================
echo.
echo   Starting server...
echo   Browser will open at http://localhost:8008
echo   Close this window to stop the server.
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:8008"
"%~dp0python\python.exe" serve.py
