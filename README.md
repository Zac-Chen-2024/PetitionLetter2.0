# PetitionLetter

EB-1A / L-1 签证申请文书智能生成系统 | Immigration Petition Letter AI Generator

[English](#english) | [中文](#中文)

---

## English

### Overview

An intelligent legal document generation system for EB-1A (Extraordinary Ability) and L-1 visa petition letters. The system processes supporting documents through OCR, extracts evidence with LLM, organizes arguments according to legal standards, and generates professional petition paragraphs with proper exhibit citations and full provenance tracking.

### Key Features

- **Multi-stage Evidence Pipeline**: OCR → Extraction → Argument Organization → Letter Generation
- **Legal Standards Compliance**: Arguments organized per 8 C.F.R. §204.5(h)(3) criteria
- **Visual Argument Tree**: Interactive graph showing Arguments → SubArguments → Snippets hierarchy
- **Bidirectional Focus**: Click any element to highlight related items across all panels
- **Full Provenance**: Every sentence traces back to source exhibits with page/paragraph references
- **PDF Magnifier**: 2x zoom lens for detailed document inspection

### Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PetitionLetter System                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│  │   Stage 1   │   │   Stage 2   │   │   Stage 3   │   │   Stage 4   │       │
│  │     OCR     │ → │  Evidence   │ → │  Argument   │ → │   Letter    │       │
│  │  Extraction │   │  Extraction │   │Organization │   │ Generation  │       │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘       │
│        ↓                 ↓                 ↓                 ↓                │
│    PDF/Image        Snippets +        Arguments +      Paragraphs +          │
│    → Text           Entities          SubArguments     [Exhibit X] refs      │
│                                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                           Frontend (3-Panel Layout)                           │
│  ┌─────────────────┬─────────────────────────┬─────────────────────┐         │
│  │  Evidence Cards │      Writing Tree       │    Letter Panel     │         │
│  │  + PDF Preview  │   (Argument Graph)      │  (Generated Text)   │         │
│  │      25%        │        flex-1           │       480px         │         │
│  └─────────────────┴─────────────────────────┴─────────────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | FastAPI, Pydantic, PyMuPDF |
| **Frontend** | React 18, TypeScript, Tailwind CSS, Vite |
| **PDF Rendering** | react-pdf |
| **LLM Providers** | DeepSeek API, OpenAI API (configurable) |
| **Storage** | File-based JSON (project data) |

### EB-1A Standards Supported

| Standard | Code Reference | Description |
|----------|----------------|-------------|
| Membership | §204.5(h)(3)(ii) | Membership in associations requiring outstanding achievements |
| Published Material | §204.5(h)(3)(iii) | Published material about the applicant in major media |
| Original Contribution | §204.5(h)(3)(v) | Original contributions of major significance |
| Leading Role | §204.5(h)(3)(viii) | Leading or critical role in distinguished organizations |
| Awards | §204.5(h)(3)(i) | Nationally or internationally recognized prizes |

### Quick Start

**Backend:**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # Configure API keys
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend/frontend
npm install
npm run dev
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/documents/{project_id}/exhibits` | GET | List project exhibits |
| `/api/analysis/extract/{project_id}/{exhibit_id}` | POST | Extract snippets from exhibit |
| `/api/arguments/{project_id}/generate` | POST | Generate arguments with SubArguments |
| `/api/write/v3/{project_id}/{standard}` | POST | Generate petition paragraph (V3) |
| `/api/write/v3/{project_id}/edit` | POST | AI-assisted text editing |

### Project Structure

```
PetitionLetter/
├── backend/
│   ├── app/
│   │   ├── routers/           # API routes (documents, arguments, writing)
│   │   ├── services/          # Business logic
│   │   │   ├── unified_extractor.py      # Evidence extraction
│   │   │   ├── legal_argument_organizer.py # LLM + legal standards
│   │   │   ├── subargument_generator.py  # SubArgument generation
│   │   │   ├── petition_writer_v3.py     # V3 letter generation
│   │   │   └── llm_client.py             # Multi-provider LLM client
│   │   └── main.py
│   └── requirements.txt
├── frontend/frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ArgumentGraph.tsx    # Writing Tree visualization
│   │   │   ├── EvidenceCardPool.tsx # Evidence cards
│   │   │   ├── LetterPanel.tsx      # Generated letter display
│   │   │   ├── DocumentViewer.tsx   # PDF viewer with magnifier
│   │   │   └── Magnifier.tsx        # PDF zoom lens
│   │   ├── context/AppContext.tsx   # Global state management
│   │   └── types/index.ts           # TypeScript definitions
│   └── package.json
├── Doc/
│   └── 开发日志.md              # Development log (Chinese)
└── README.md
```

---

## 中文

### 项目概述

EB-1A（杰出人才）及 L-1 签证申请文书智能生成系统。系统通过 OCR 处理证明材料，使用 LLM 提取证据、按法律标准组织论点，最终生成带有规范证据引用和完整溯源链的申请文书段落。

### 核心功能

- **多阶段证据处理流水线**：OCR → 证据提取 → 论点组织 → 文书生成
- **法律标准合规**：按 8 C.F.R. §204.5(h)(3) 各款要求组织论点
- **可视化论点树**：交互式图形展示 子论点 → 次级子论点 → 证据片段 层级
- **双向聚焦联动**：点击任意元素，所有面板高亮关联项
- **完整溯源链**：每个句子可追溯到源 Exhibit 的具体页码段落
- **PDF 放大镜**：2 倍放大镜便于查看文档细节

### 系统架构

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           PetitionLetter 系统架构                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│  │   第1阶段   │   │   第2阶段   │   │   第3阶段   │   │   第4阶段   │       │
│  │     OCR     │ → │  证据提取   │ → │  论点组织   │ → │  文书生成   │       │
│  │   文字识别  │   │   Snippets  │   │  Arguments  │   │  Paragraphs │       │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘       │
│                                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                            前端（三栏布局）                                     │
│  ┌─────────────────┬─────────────────────────┬─────────────────────┐         │
│  │   Evidence      │       Writing Tree      │    Letter Panel     │         │
│  │   Cards         │       (论点图)          │    (生成文书)        │         │
│  │ + PDF Preview   │                         │                     │         │
│  │      25%        │        flex-1           │       480px         │         │
│  └─────────────────┴─────────────────────────┴─────────────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | FastAPI, Pydantic, PyMuPDF |
| **前端** | React 18, TypeScript, Tailwind CSS, Vite |
| **PDF 渲染** | react-pdf |
| **LLM 服务** | DeepSeek API, OpenAI API（可配置切换） |
| **存储** | 基于文件的 JSON（项目数据） |

### 支持的 EB-1A 标准

| 标准 | 法规引用 | 说明 |
|------|----------|------|
| Membership | §204.5(h)(3)(ii) | 要求杰出成就才能加入的协会会员资格 |
| Published Material | §204.5(h)(3)(iii) | 主要媒体对申请人的报道 |
| Original Contribution | §204.5(h)(3)(v) | 具有重大意义的原创贡献 |
| Leading Role | §204.5(h)(3)(viii) | 在著名组织担任领导或关键角色 |
| Awards | §204.5(h)(3)(i) | 国家或国际认可的奖项 |

### 快速开始

**后端：**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # 配置 API 密钥
uvicorn app.main:app --reload --port 8000
```

**前端：**
```bash
cd frontend/frontend
npm install
npm run dev
```

### 访问地址

- **前端界面**: http://localhost:5173
- **后端 API**: http://localhost:8000
- **API 文档**: http://localhost:8000/docs

### 数据层级结构

```
Standard (法律标准)
  └── Argument (子论点)
        └── SubArgument (次级子论点)
              └── Snippet (证据片段)
                    └── Exhibit (原始文档)
```

### 主要 API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/documents/{project_id}/exhibits` | GET | 获取项目 Exhibit 列表 |
| `/api/analysis/extract/{project_id}/{exhibit_id}` | POST | 从 Exhibit 提取 Snippets |
| `/api/arguments/{project_id}/generate` | POST | 生成论点和次级子论点 |
| `/api/write/v3/{project_id}/{standard}` | POST | V3 文书生成（带溯源） |
| `/api/write/v3/{project_id}/edit` | POST | AI 辅助文本编辑 |

---

## License

MIT
