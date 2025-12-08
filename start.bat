@echo off
chcp 65001 >nul
title Petition Pipeline

echo ========================================
echo    Petition Pipeline - 一键启动
echo ========================================
echo.

:: 检查配置文件
if not exist "backend\.env" (
    echo [错误] backend\.env 不存在!
    echo 请复制 backend\.env.example 为 backend\.env 并配置 API Key
    echo.
    pause
    exit /b 1
)

if not exist "frontend\.env.local" (
    echo [提示] frontend\.env.local 不存在，正在从模板创建...
    copy "frontend\.env.example" "frontend\.env.local" >nul
    echo [完成] 已创建 frontend\.env.local
)

echo [1/4] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+
    pause
    exit /b 1
)

echo [2/4] 检查 Node.js 环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)

echo [3/4] 安装后端依赖...
cd backend
pip install -r requirements.txt -q
cd ..

echo [4/4] 安装前端依赖...
cd frontend
call npm install --silent
cd ..

echo.
echo ========================================
echo    启动服务
echo ========================================
echo.
echo 后端: http://localhost:8001
echo 前端: http://localhost:3000
echo API文档: http://localhost:8001/docs
echo.
echo 按 Ctrl+C 停止所有服务
echo ========================================
echo.

:: 启动后端 (新窗口)
start "Backend - Port 8001" cmd /k "cd backend && python run.py"

:: 等待后端启动
timeout /t 3 /nobreak >nul

:: 启动前端 (新窗口)
start "Frontend - Port 3000" cmd /k "cd frontend && npm run dev"

:: 等待几秒后打开浏览器
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo 服务已启动！
echo 关闭此窗口不会停止服务，请手动关闭 Backend 和 Frontend 窗口。
pause
