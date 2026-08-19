# PetitionLetter 2.0

Evidence-first authoring for U.S. immigration petition letters — **EB-1A**, **NIW** (Dhanasar), and **L-1A**.

The lawyer edits *structure* (legal standard → argument → sub-argument → evidence snippets); the system writes
prose from that structure and keeps a **sentence-level provenance chain** back to the exact bounding box on the
exhibit PDF. Nothing is scored or auto-accepted: the tool states facts and removes mechanical friction, the
judgement stays with the lawyer.

[English](#english) · [中文](#中文)

---

## English

### What it does

```
exhibit PDFs ──OCR──▶ snippets (text + bbox + evidence type/layer)
                          │
                          ├─▶ top-down pickup per legal standard ─▶ Arguments ─▶ SubArguments
                          │                                                          │
                          └──────────────── assigned as evidence ────────────────────┘
                                                                                     │
                                                              3-step writer ─────────▶ letter section
                                                              (每 sentence 记 snippet_ids + exhibit refs)
```

Three-panel UI:

| Panel | Contents |
|---|---|
| **Evidence Cards** (left) | extracted snippets + PDF viewer with bounding boxes; other snippets on the same page are drawn as dashed "candidate" boxes so a mis-citation of a neighbouring passage is visible at a glance |
| **Writing Tree** (centre) | canvas of Standard → Argument → SubArgument (react-flow renderer behind `?canvas=v2`); drag snippets onto sub-arguments, merge / move / consolidate, per-node regenerate, evidence-coverage panel, structural undo/redo |
| **Letter Panel** (right) | generated sections; click a sentence to jump to its source; regeneration shows a sentence-level diff (unchanged / added / modified / removed) that you **accept or revert** |

### Quick start

Prerequisites: **Python 3.10+**, **Node.js 18+**, and an API key for at least one LLM provider
(DeepSeek, OpenAI-compatible, or Anthropic).

```bash
git clone https://github.com/Zac-Chen-2024/PetitionLetter2.0.git
cd PetitionLetter2.0

# backend
cd backend
pip install -r requirements.txt
cp .env.example .env          # then fill in the key for your LLM_PROVIDER
python -m uvicorn app.main:app --reload --port 8000

# frontend (new terminal)
cd frontend
npm install
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| OpenAPI docs | http://localhost:8000/docs |

`setup.sh` / `setup.bat` do the same thing in one step and unpack `data/Test.zip` if you have sample data.

The server **refuses to start** if the key for the configured `LLM_PROVIDER` is missing — that is deliberate
(a missing key used to surface two minutes into a pipeline run).

### Configuration

Every setting lives in `backend/.env` and is documented in `backend/.env.example`. The ones that matter:

```env
LLM_PROVIDER=deepseek                  # deepseek | openai | anthropic — its key must be set
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
CORS_ORIGINS=http://localhost:5173     # allow-list, never "*"
AUTH_DISABLED=true                     # local dev only; set false on any shared host
DATA_DIR=                              # defaults to backend/data
LLM_CACHE_ENABLED=true                 # content-addressed cache for identical calls
LLM_TRACE_ENABLED=true                 # JSONL traces under data/traces (contains prompts — see Privacy)
LOG_LEVEL=INFO
```

### Workspaces (multi-user / study deployment)

One bearer token = one workspace = one participant. All state lives under
`backend/data/workspaces/<workspace>/`. Cross-workspace access answers **404**, never 403 — the existence of
another workspace's project is not disclosed.

```bash
cd backend
python scripts/mint_token.py --label P07   # prints a token; hand out http://host/?token=<token>
python scripts/mint_token.py --list
```

Data created before workspaces existed:

```bash
python scripts/migrate_to_workspaces.py --dry-run   # then re-run without --dry-run (tars a backup first)
```

With `AUTH_DISABLED=true` everything falls back to the `default` workspace and no token is needed.

### Long-running work: the job model

Extraction, argument generation and letter writing are **asynchronous jobs**, not blocking POSTs:

```
POST /api/extraction/{pid}/extract        →  202 {id, status: "queued", …}
GET  /api/jobs/{id}                       →  poll until status ∈ {succeeded, failed, cancelled}
POST /api/jobs/{id}/cancel                →  cooperative cancel at the next pipeline checkpoint
```

`result` on a succeeded job is exactly the payload the old synchronous endpoint returned. Identical in-flight
requests are de-duplicated (same params → same job). Jobs left `running` by a server restart are marked failed
on the next boot. The writer additionally checkpoints Step 1 per argument, keyed by a structural fingerprint,
so a retry does not re-burn the most expensive stage.

### API surface

Everything is under `/api`. Path parameters are validated against an allow-list; unknown or malformed ids 404.

| Area | Endpoints |
|---|---|
| Projects | `GET/POST /projects` · `GET /projects/types` · `GET/PATCH/DELETE /projects/{pid}` · `GET /projects/{pid}/standards` |
| Documents | `GET /documents/{pid}/exhibits` · `GET /documents/{pid}/pdf/{exhibit_id}` |
| Extraction | `POST /extraction/{pid}/extract` *(job)* · `GET /extraction/{pid}/snippets` · merge suggestions: `GET`, `POST …/generate`, `POST …/merges/confirm`, `POST …/merges/apply` |
| Arguments | `GET /arguments/{pid}` · `POST …/generate` *(job)* · `POST …/regenerate-standard` · `POST/PUT/DELETE …/subarguments…` · `…/subarguments/{merge,move,consolidate}` · `POST …/arguments` · `DELETE …/standards/{key}` · `POST …/move-to-overall-merits` · AI helpers `…/recommend-snippets`, `…/infer-relationship`, `…/infer-argument-title` |
| Judgement surfaces | `GET /arguments/{pid}/coverage` · `GET /arguments/{pid}/history` · `POST /arguments/{pid}/undo` · `POST /arguments/{pid}/redo` |
| Writing | `POST /write/v3/{pid}/{standard_key}` *(job)* · `GET /write/v3/{pid}/sections` · `PUT /write/v3/{pid}/{standard_key}/sentences` · `POST /write/v3/{pid}/analyze-impact` |
| Jobs | `GET /jobs` · `GET /jobs/{id}` · `POST /jobs/{id}/cancel` |
| Logs | `POST /logs/interactions` |
| Health | `GET /api/health` |

### Data layout

```
backend/data/
├── workspaces.json                     # token → workspace table
└── workspaces/<ws>/
    ├── projects/<project_id>/
    │   ├── meta.json                   # project metadata (visa type, applicant, …)
    │   ├── documents/                  # exhibit PDFs
    │   ├── extraction/                 # combined_extraction.json, registry.json
    │   ├── legal_arguments.json        # Arguments + SubArguments (the structure)
    │   ├── arguments_history/          # structural undo / redo snapshots
    │   └── writing_v3/                 # letter versions + Step-1 checkpoints
    ├── jobs/                           # job records
    └── logs/                           # interaction logs (JSONL)

backend/data/traces/<date>.jsonl        # LLM call traces  (data root, not per-workspace)
backend/data/llm_cache/<sha256>.json    # content-addressed LLM response cache
```

Every JSON write goes through one channel (`app/core/atomic_io.py`): temp file → `fsync` → `os.replace`, a
`.bak` hard link taken beforehand, a per-path thread lock plus a `portalocker` sentinel for cross-process
safety, and `update_json()` for locked read-modify-write. There is no database; a crash mid-write leaves
either the complete old file or the complete new one.

Back up with `backend/scripts/backup_data.sh <DATA_DIR> <DEST>` (tars `data/`, skipping locks and the LLM
cache, then copies or rsyncs); a crontab line is in the script header.

### Prompts

Every LLM prompt is a versioned file under `backend/prompts/<module>/<name>@vN.md` — see
[`backend/prompts/README.md`](backend/prompts/README.md) for the format, the module map, and the rules.
Structured prompt content (per-standard evidence pickup criteria) lives beside them as `@vN.json` assets.
Prompt bodies are hashed into a snapshot test, so **wording cannot change silently** — a prompt edit needs a
version bump and shows up as its own commit.

### Development

```bash
cd backend  && pip install -r requirements-dev.txt && ruff check app tests scripts && pytest -q
cd frontend && npm ci && npx tsc -b && npx eslint . && npm run build
```

`.github/workflows/ci.yml` runs exactly these on every push. Tests never call a live LLM.

Useful flags: `?canvas=v2` switches the Writing Tree to the react-flow renderer and remembers it
(`?canvas=v1` switches back); the legacy hand-written canvas is still the default until the parity
checklist is signed off. `SKIP_LLM_CONFIG_CHECK=1` starts the server without provider keys (tests use it).

Keyboard in the Writing Tree: `j`/`k` walk sub-arguments, `v` cycles the focused sub-argument's evidence in
the PDF, `Esc` clears modes and selection, `Ctrl/⌘+Z` / `Ctrl+Shift+Z` undo & redo structural edits.

### Privacy & scope

This tool processes **real immigration case files**. Before deploying anywhere shared:

- set `AUTH_DISABLED=false` and hand out per-participant tokens; keep `CORS_ORIGINS` tight
- remember that prompts (and therefore exhibit text) are sent to whichever third-party LLM provider you
  configure, and that `LLM_TRACE_ENABLED=true` writes those prompts to `data/traces/` in the clear — turn it
  off, or scope and rotate the directory, if that is not acceptable for your data-handling agreement
- the generated text is a drafting aid, not legal advice, and every citation is meant to be verified through
  the provenance chain before filing

### Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI · Pydantic v2 · httpx · tenacity · portalocker · asyncio job runner |
| Frontend | React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · TanStack Query v5 · @xyflow/react 12 · react-pdf |
| LLM | DeepSeek · OpenAI-compatible · Anthropic (native SDK, JSON-schema output) |

---

## 中文

### 这是什么

面向美国移民申请文书（**EB-1A** / **NIW** / **L-1A**）的证据优先写作系统。

律师编辑的是**结构**（法律标准 → Argument → SubArgument → 证据 snippet），文书由结构生成，并且**每一句都记录
溯源链**——回到 exhibit PDF 上那一个 bounding box。系统不打分、不自动接受：它只陈述事实、消除机械摩擦，判断留给律师。

处理流程与三栏布局见上方英文部分的示意图。要点：

- **Evidence Cards（左）**：抽取出的 snippet + PDF bbox 高亮；同页其它 snippet 以浅色虚线框显示，"引的是旁边那段"一眼可见
- **Writing Tree（中）**：画布（react-flow 版在 `?canvas=v2` 后面），拖 snippet、合并/移动/归并 SubArgument、单节点重生成、证据覆盖面板、结构级 undo/redo
- **Letter Panel（右）**：点句子跳到出处；重生成显示**句级 diff**（未变/新增/改写/删除），由你 Accept 或 Revert

### 快速开始

需要 **Python 3.10+**、**Node.js 18+**，以及至少一个 LLM provider 的 API key（DeepSeek / OpenAI 兼容 / Anthropic）。

```bash
git clone https://github.com/Zac-Chen-2024/PetitionLetter2.0.git
cd PetitionLetter2.0

# 后端
cd backend
pip install -r requirements.txt
cp .env.example .env          # 填入 LLM_PROVIDER 对应的 key
python -m uvicorn app.main:app --reload --port 8000

# 前端（新终端）
cd frontend
npm install
npm run dev
```

前端 http://localhost:5173 ｜ 后端 http://localhost:8000 ｜ API 文档 http://localhost:8000/docs。
`setup.sh` / `setup.bat` 可一步完成，并在存在 `data/Test.zip` 时解包示例数据。

**缺少当前 provider 的 key 时服务器会拒绝启动**——这是刻意的：以前要等到 pipeline 跑两分钟才报错。

### 配置

全部配置项在 `backend/.env`，`backend/.env.example` 有逐项说明。关键几项：

```env
LLM_PROVIDER=deepseek                  # deepseek | openai | anthropic，对应 key 必须存在
DEEPSEEK_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
CORS_ORIGINS=http://localhost:5173     # 白名单，绝不用 "*"
AUTH_DISABLED=true                     # 仅本地开发；任何共享部署都要设为 false
LLM_CACHE_ENABLED=true                 # 相同调用的内容寻址缓存
LLM_TRACE_ENABLED=true                 # data/traces 下的 JSONL 轨迹（含 prompt 原文，见"隐私"）
```

### Workspace（多用户 / 实验部署）

一个 token = 一个 workspace = 一个被试，数据都在 `backend/data/workspaces/<workspace>/` 下。
跨 workspace 访问一律 **404**（不是 403，不泄露资源是否存在）。

```bash
cd backend
python scripts/mint_token.py --label P07   # 打印 token，把 http://host/?token=<token> 给被试
python scripts/mint_token.py --list
python scripts/migrate_to_workspaces.py --dry-run   # 迁移历史数据，确认后去掉 --dry-run（会先打 tar 备份）
```

`AUTH_DISABLED=true` 时全部落到 `default` workspace，本机开发零摩擦。

### 长任务：job 模型

抽取、生成论点、写作都是**异步 job**，不是阻塞 POST：提交返回 `202` 与 job 记录 → 轮询 `GET /api/jobs/{id}`
→ 终态时 `result` 就是原来同步端点的返回体。相同参数的进行中请求会被去重（狂点只跑一次）；
`POST /api/jobs/{id}/cancel` 在流水线的自然检查点协作式取消；服务器重启会把残留的 running job 标为 failed。
写作还会按结构指纹为每个 Argument 缓存 Step 1，重试不会重烧最贵的一步。

### API 一览

见上方英文 [API surface](#api-surface) 表（路径参数走白名单校验，非法 id 一律 404）。

### 数据布局与写入保证

目录结构见英文 [Data layout](#data-layout)。所有 JSON 落盘只有一个通道 `app/core/atomic_io.py`：
临时文件 → `fsync` → `os.replace`，写前用硬链接留 `.bak`，同进程 per-path 线程锁 + 跨进程 `portalocker` 哨兵，
读-改-写走 `update_json()`。没有数据库；任何时刻崩溃，磁盘上要么是完整旧版要么是完整新版。

备份：`backend/scripts/backup_data.sh <DATA_DIR> <DEST>`（打包 `data/`，跳过锁文件与 LLM 缓存），
脚本头部有 crontab 示例。

### Prompt 管理

所有 LLM prompt 都是版本化文件 `backend/prompts/<module>/<name>@vN.md`，格式与规则见
[`backend/prompts/README.md`](backend/prompts/README.md)；结构化的 prompt 内容（各标准的证据挑选准则）
以 `@vN.json` 资产形式并列存放。prompt 正文全部纳入 hash 快照测试——**措辞不可能被悄悄改动**，
改 prompt 必须升版本号，并且会独立成一个 commit。

### 开发

```bash
cd backend  && pip install -r requirements-dev.txt && ruff check app tests scripts && pytest -q
cd frontend && npm ci && npx tsc -b && npx eslint . && npm run build
```

CI（`.github/workflows/ci.yml`）每次 push 跑的就是这几条；测试不会调用真实 LLM。

调试开关：`?canvas=v2` 切到 react-flow 画布并记住选择（`?canvas=v1` 切回）——parity 清单签收前默认仍是旧版
手写画布；`SKIP_LLM_CONFIG_CHECK=1` 可无 key 启动。

Writing Tree 键盘：`j`/`k` 上下切换 SubArgument，`v` 循环查看当前 SubArgument 的证据，`Esc` 清除模式与选中，
`Ctrl/⌘+Z`、`Ctrl+Shift+Z` 结构级撤销/重做。

### 隐私与边界

本工具处理**真实移民案件材料**。任何共享部署前请注意：

- 设 `AUTH_DISABLED=false` 并按人发 token，`CORS_ORIGINS` 收紧
- prompt（因而包括 exhibit 原文）会发送给你配置的第三方 LLM provider；`LLM_TRACE_ENABLED=true` 会把这些
  prompt 明文写入 `data/traces/`——若不符合你的数据处理约定，请关闭或单独管控与轮转该目录
- 生成的文本是起草辅助而非法律意见；提交前每一处引用都应通过溯源链核对

---

## License

MIT
