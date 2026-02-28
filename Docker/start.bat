@echo off
cd /d "%~dp0"
echo Building and starting PetitionLetter ...
docker compose up --build -d
echo.
echo Waiting for container to start...
timeout /t 5 /nobreak >nul
echo Opening http://localhost:8008
start http://localhost:8008
