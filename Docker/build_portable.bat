@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set PYTHON_VER=3.11.9
set PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VER%/python-%PYTHON_VER%-embed-amd64.zip
set DIST=%~dp0dist\PetitionLetter
set ROOT=%~dp0..

echo.
echo  =============================================
echo   Building PetitionLetter Portable Package
echo  =============================================
echo.

REM --- Clean old build ---
if exist "%~dp0dist" rmdir /s /q "%~dp0dist"
mkdir "%DIST%"

REM ===== 1. Embedded Python =====
echo [1/7] Downloading Python %PYTHON_VER% embedded...
curl -L -o "%~dp0_python.zip" "%PYTHON_URL%"
if errorlevel 1 (echo ERROR: Failed to download Python & pause & exit /b 1)

mkdir "%DIST%\python"
powershell -Command "Expand-Archive -Path '%~dp0_python.zip' -DestinationPath '%DIST%\python' -Force"
del "%~dp0_python.zip"

REM Configure python path: allow imports from packages/ and backend/
(
echo python311.zip
echo .
echo Lib\site-packages
echo ..\packages
echo ..\backend
echo import site
) > "%DIST%\python\python311._pth"

REM ===== 2. Install pip =====
echo [2/7] Installing pip...
curl -sL -o "%DIST%\python\get-pip.py" https://bootstrap.pypa.io/get-pip.py
"%DIST%\python\python.exe" "%DIST%\python\get-pip.py" --no-warn-script-location -q
del "%DIST%\python\get-pip.py"

REM ===== 3. Install Python dependencies =====
echo [3/7] Installing Python dependencies...
"%DIST%\python\python.exe" -m pip install --no-cache-dir -q --target "%DIST%\packages" -r "%ROOT%\backend\requirements.txt"

REM ===== 4. Build frontend =====
echo [4/7] Building frontend...
cd "%ROOT%\frontend\frontend"
call npm install --silent
set VITE_API_BASE=/api
call npx vite build
cd "%~dp0"

REM ===== 5. Assemble files =====
echo [5/7] Copying backend...
xcopy /E /I /Q "%ROOT%\backend\app"  "%DIST%\backend\app"  >nul
xcopy /E /I /Q "%ROOT%\backend\data" "%DIST%\backend\data" >nul
copy /Y "%ROOT%\backend\.env" "%DIST%\backend\.env" >nul 2>nul

echo [6/7] Copying data (PDFs + OCR)...
xcopy /E /I /Q "%ROOT%\data\Dehuan Liu" "%DIST%\data\Dehuan Liu" >nul
xcopy /E /I /Q "%ROOT%\data\Yaruo Qu"   "%DIST%\data\Yaruo Qu"  >nul

echo [7/7] Assembling final package...
xcopy /E /I /Q "%ROOT%\frontend\frontend\dist" "%DIST%\backend\frontend-dist" >nul
copy /Y "%~dp0serve.py" "%DIST%\backend\serve.py" >nul
copy /Y "%~dp0start_template.bat" "%DIST%\start.bat" >nul
copy /Y "%ROOT%\backend\requirements.txt" "%DIST%\requirements.txt" >nul
copy /Y "%~dp0repack_for_mac.sh" "%DIST%\repack_for_mac.sh" >nul

REM ===== 8. Create zip (using tar for Mac compatibility) =====
echo.
echo [8/8] Creating zip...
cd "%~dp0dist"
tar -cf PetitionLetter.zip --format=zip PetitionLetter
cd "%~dp0"

echo.
echo  =============================================
echo   Done!
echo   Output:  %~dp0dist\PetitionLetter.zip
echo.
echo   Send this zip to the lawyer.
echo   Windows: unzip, double-click start.bat
echo   Mac:     unzip, run repack_for_mac.sh, double-click start.command
echo  =============================================
echo.
pause
