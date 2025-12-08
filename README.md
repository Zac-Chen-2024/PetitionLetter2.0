# Petition Pipeline

文档处理流水线系统：OCR → 分析 → 关系提取 → 文书撰写

## 项目结构

```
petition-pipeline/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── core/           # 配置
│   │   ├── db/             # 数据库
│   │   ├── models/         # 数据模型
│   │   ├── routers/        # API 路由
│   │   ├── services/       # 业务逻辑
│   │   └── main.py         # 入口
│   ├── .env                # 配置文件 (需自行创建)
│   ├── .env.example        # 配置模板
│   ├── requirements.txt
│   └── run.py
├── frontend/               # Next.js 前端
│   ├── src/
│   ├── .env.local          # 前端配置 (需自行创建)
│   ├── .env.example        # 配置模板
│   └── package.json
├── start.bat               # Windows 一键启动
├── start.sh                # Linux/Mac 一键启动
└── README.md
```

---

## 快速开始 (一键部署)

### 前置要求

- Python 3.10+
- Node.js 18+
- OpenAI API Key
- 百度 OCR API Key ([申请地址](https://cloud.baidu.com/product/ocr))

### 第一步：配置环境变量

#### Backend 配置

```bash
# 复制配置模板
cp backend/.env.example backend/.env

# 编辑配置文件，填入你的 API Key
```

**backend/.env** 必填项：
```env
OPENAI_API_KEY=sk-your-openai-key
BAIDU_OCR_API_KEY=your-baidu-key
BAIDU_OCR_SECRET_KEY=your-baidu-secret
```

#### Frontend 配置

```bash
# 复制配置模板
cp frontend/.env.example frontend/.env.local
```

默认配置即可使用，无需修改。

### 第二步：一键启动

#### Windows

双击运行 `start.bat` 或在命令行执行：
```cmd
start.bat
```

#### Linux / macOS

```bash
chmod +x start.sh
./start.sh
```

### 第三步：访问系统

- **前端界面**: http://localhost:3000
- **后端 API**: http://localhost:8001
- **API 文档**: http://localhost:8001/docs

---

## 手动部署

### Backend

```bash
cd backend

# 创建虚拟环境 (推荐)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动
python run.py
```

### Frontend

```bash
cd frontend

# 安装依赖
npm install

# 开发模式
npm run dev

# 或生产构建
npm run build && npm start
```

---

## 配置说明

### 配置文件位置

| 文件 | 说明 |
|------|------|
| `backend/.env` | **后端配置 (敏感！不要上传)** |
| `frontend/.env.local` | 前端配置 |

### 支持的 LLM Provider

在 `backend/.env` 中配置 `LLM_PROVIDER`:

| Provider | 配置值 | 需要的环境变量 |
|----------|--------|----------------|
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Azure OpenAI | `azure` | `AZURE_OPENAI_*` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` |
| Claude | `claude` | `CLAUDE_API_KEY` |

---

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/upload` | POST | 上传文档并执行 OCR |
| `/api/documents/{project_id}` | GET | 获取项目文档列表 |
| `/api/analyze/{document_id}` | POST | LLM1 分析文档 |
| `/api/analysis/{document_id}` | GET | 获取分析结果 |
| `/api/relationship/{project_id}` | POST | LLM2 分析关系 |
| `/api/write/{project_id}` | POST | LLM3 生成段落 |
| `/api/health` | GET | 健康检查 |

---

## 流水线阶段

1. **Stage 1 - OCR**: 百度 OCR 高精度版，支持 PDF 和图片
2. **Stage 2 - LLM1 分析**: 提取实体、标签、关键引用
3. **Stage 3 - LLM2 关系**: 分析实体关系和证据链
4. **Stage 4 - LLM3 撰写**: 生成带 `[Exhibit X]` 引用的段落

---

## 常见问题

### Q: 启动报错找不到模块？
A: 确保已安装所有依赖：
```bash
cd backend && pip install -r requirements.txt
cd frontend && npm install
```

### Q: OCR 不工作？
A: 检查百度 OCR API Key 是否正确配置在 `backend/.env`

### Q: 前端连不上后端？
A: 确认 `frontend/.env.local` 中的 `NEXT_PUBLIC_API_BASE_URL` 指向正确的后端地址

---

## License

MIT
