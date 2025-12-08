#!/bin/bash

echo "========================================"
echo "   Petition Pipeline - 一键启动"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 检查配置文件
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}[错误] backend/.env 不存在!${NC}"
    echo "请复制 backend/.env.example 为 backend/.env 并配置 API Key"
    echo ""
    echo "  cp backend/.env.example backend/.env"
    echo "  然后编辑 backend/.env 填入你的 API Key"
    exit 1
fi

if [ ! -f "frontend/.env.local" ]; then
    echo -e "${YELLOW}[提示] frontend/.env.local 不存在，正在从模板创建...${NC}"
    cp frontend/.env.example frontend/.env.local
    echo -e "${GREEN}[完成] 已创建 frontend/.env.local${NC}"
fi

# 检查 Python
echo "[1/4] 检查 Python 环境..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[错误] 未找到 Python，请先安装 Python 3.10+${NC}"
    exit 1
fi

# 检查 Node.js
echo "[2/4] 检查 Node.js 环境..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}[错误] 未找到 Node.js，请先安装 Node.js 18+${NC}"
    exit 1
fi

# 安装后端依赖
echo "[3/4] 安装后端依赖..."
cd backend
pip3 install -r requirements.txt -q
cd ..

# 安装前端依赖
echo "[4/4] 安装前端依赖..."
cd frontend
npm install --silent
cd ..

echo ""
echo "========================================"
echo "   启动服务"
echo "========================================"
echo ""
echo -e "${GREEN}后端:${NC} http://localhost:8001"
echo -e "${GREEN}前端:${NC} http://localhost:3000"
echo -e "${GREEN}API文档:${NC} http://localhost:8001/docs"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo "========================================"
echo ""

# 清理函数
cleanup() {
    echo ""
    echo "正在停止服务..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# 启动后端
cd backend
python3 run.py &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# 等待前端启动后打开浏览器
sleep 5
if command -v open &> /dev/null; then
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
fi

echo -e "${GREEN}服务已启动！${NC}"
echo ""

# 等待子进程
wait
