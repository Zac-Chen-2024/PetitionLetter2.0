# System Renovation Manual v2

## 全局目标

将现有系统从 L-1 paragraph-level pipeline 升级为 EB-1A sentence-level provenance 系统，同时加入 snippet 关联信号层，支撑论文 Section 4.4 的所有技术声明。

**改造范围：** 后端 pipeline + provenance engine + snippet linker | 前端 WritingCanvas + DocumentViewer

**预估总工时：** 5-7 天

---

## 一、现状 vs 目标

### 现有链路

```
OCR (deepseek_ocr)
  → text_blocks [id, text, bbox_x1/y1/x2/y2, page]
    → L1 analyzer → quotes [quote_text, standard_key, page, exhibit_id]
      → bbox_matcher → quote ↔ text_block 匹配 [block_id, bbox, match_score]
        → quote_index_map {idx: {exhibit_id, material_id, page, quote, bbox}}
          → Writing (单步) → paragraph_text + citations_used [{exhibit_id, exhibit_title}]
```

### 目标链路

```
OCR (deepseek_ocr)
  → text_blocks [id, text, bbox, page]                                    ← 不变 (Step 1)
    → Snippet Extraction → snippets [snippet_id, text, bbox, ...]         ← 加 ID (Step 2)
      → Relationship Analyzer → 实体图                                    ← 已有，扩展实体类型
        → Snippet Linker → snippet 关联信号 [co-reference, ...]           ← 新增
          → 律师拖拽映射 + 关联信号辅助                                     ← 前端已有
            → Writing (两步拆分)
              → 3a 自由写作 (Claude Sonnet)                               ← 新增
              → 3b 句子级标注 (GPT-4o-mini strict schema)                 ← 新增
                → Hybrid Retrieval → 补全/修正 snippet_ids                ← 新增 (Step 4)
                  → BBox Highlight → 点击句子 → 高亮 bbox                 ← 前端新增 (Step 5)
```

---

## 二、API 架构 — 多模型分工

| 任务 | 模型 | 原因 | 输入规模 |
|------|------|------|---------|
| Snippet Extraction | GPT-4o-mini | 定式、strict schema、128K context | 单个 material 5-30K tokens |
| Relationship Analysis | GPT-4o-mini | 实体抽取、定式 | 分批，每批 ~5K tokens |
| Writing (3a) | Claude Sonnet | 法律写作质量最好 | 已映射 snippets ~3-6K tokens |
| Annotation (3b) | GPT-4o-mini | strict JSON schema 100% 合规 | 段落 + snippets ~4-8K tokens |
| Snippet Linker | 无 LLM（图算法） | 从实体图推导，零成本 | 内存计算 |

### Context 长度分析

**瓶颈只在 Snippet Extraction。** 后续所有步骤的输入都是已提取的 snippets（几十条、每条百余字），不再需要完整 OCR 文本。

```
阶段              输入                         大小          是否瓶颈
OCR              PDF 图片                      不走 LLM      —
Snippet Extract  单个 material 的 OCR 文本      5-30K tokens  ★ 唯一瓶颈
Relationship     snippets 分批                  ~5K/批        ✓ 已解决（现有分批逻辑）
Writing 3a       已映射 snippets                ~3-6K         完全够
Annotation 3b    段落 + snippets                ~4-8K         完全够
Provenance       句子 + snippets                ~2K           完全够
```

**现有 material_splitter 已经解决了大 exhibit 问题：** 200 页 exhibit → 拆成 10-20 个 materials → 每个 5-20 页 → 每个 5K-30K tokens → GPT-4o-mini 128K context 完全够。

### Context 不失真策略

Snippet Extraction 阶段，完整 OCR 文本可能含大量格式噪声。现有 `clean_ocr_for_llm()` 已在做清洗，但可以进一步优化：

```python
def compress_ocr_for_extraction(ocr_text: str, max_tokens: int = 60000) -> str:
    """
    压缩 OCR 文本用于 snippet extraction，保留信息密度
    
    策略：
    1. 去除连续空白行（>2 → 1）
    2. 去除页眉页脚重复文本
    3. 合并跨页断行
    4. 如果仍超长，按 text_block 重要性排序截断
       - 表格、数字、人名、日期 → 高优先
       - 空白、页码、水印 → 低优先
    """
    import re
    
    # 1. 压缩空白
    text = re.sub(r'\n{3,}', '\n\n', ocr_text)
    text = re.sub(r'[ \t]{3,}', ' ', text)
    
    # 2. 去除重复的页眉页脚
    lines = text.split('\n')
    if len(lines) > 50:
        # 统计每行出现次数，高频行可能是页眉页脚
        from collections import Counter
        line_counts = Counter(line.strip() for line in lines if line.strip())
        threshold = max(3, len(lines) // 20)  # 出现超过 5% 的行
        header_footer = {l for l, c in line_counts.items() if c >= threshold and len(l) < 100}
        lines = [l for l in lines if l.strip() not in header_footer]
        text = '\n'.join(lines)
    
    # 3. 粗略 token 估算（1 token ≈ 4 chars 英文, ≈ 1.5 chars 中文）
    estimated_tokens = len(text) // 3  # 保守估计
    if estimated_tokens <= max_tokens:
        return text
    
    # 4. 超长时截断，保留头尾
    keep_ratio = max_tokens / estimated_tokens
    char_limit = int(len(text) * keep_ratio)
    head = text[:char_limit * 2 // 3]
    tail = text[-(char_limit // 3):]
    return head + "\n\n[... middle section omitted for length ...]\n\n" + tail
```

---

## 三、后端改造

### Step 0：Snippet 数据模型

为每个 quote 生成稳定 ID，建立 snippet 注册表。

**新建：** `backend/app/services/snippet_registry.py`

```python
"""Snippet Registry — 从 L1/EB1A 分析结果构建带 ID 的 snippet 注册表"""

import hashlib
import json
from typing import List, Dict
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
PROJECTS_DIR = DATA_DIR / "projects"


def generate_snippet_id(exhibit_id: str, page: int, quote_text: str) -> str:
    """基于内容生成确定性 snippet_id"""
    content = f"{exhibit_id}:{page}:{quote_text[:100]}"
    hash_str = hashlib.md5(content.encode()).hexdigest()[:8]
    return f"snip_{hash_str}"


def build_registry(project_id: str, analyses: List[Dict]) -> List[Dict]:
    """
    从分析结果构建 snippet 注册表
    
    Args:
        analyses: L1/EB1A analyzer 的输出列表
    Returns:
        snippets: [{snippet_id, document_id, exhibit_id, material_id, 
                     text, page, bbox, standard_key, source_block_ids}]
    """
    snippets = []
    seen_ids = set()
    
    for doc_analysis in analyses:
        exhibit_id = doc_analysis.get("exhibit_id", "")
        document_id = doc_analysis.get("document_id", "")
        
        for q in doc_analysis.get("quotes", []):
            snippet_id = generate_snippet_id(
                exhibit_id, q.get("page", 0), q.get("quote", "")
            )
            if snippet_id in seen_ids:
                continue
            seen_ids.add(snippet_id)
            
            snippets.append({
                "snippet_id": snippet_id,
                "document_id": document_id,
                "exhibit_id": exhibit_id,
                "material_id": q.get("source", {}).get("material_id", ""),
                "text": q.get("quote", ""),
                "page": q.get("page"),
                "bbox": q.get("bbox"),
                "standard_key": q.get("standard_key", ""),
                "source_block_ids": q.get("matched_block_ids", [])
            })
    
    save_registry(project_id, snippets)
    return snippets


def save_registry(project_id: str, snippets: List[Dict]):
    path = PROJECTS_DIR / project_id / "snippets" / "registry.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(snippets, f, ensure_ascii=False, indent=2)


def load_registry(project_id: str) -> List[Dict]:
    path = PROJECTS_DIR / project_id / "snippets" / "registry.json"
    if not path.exists():
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)
```

**触发时机：** 在 L1/EB1A 分析 + `enrich_quotes_with_bbox()` 完成后调用 `build_registry()`。

---

### Step 1：Dual Indexing — 不变

`deepseek_ocr.py` → TextBlock 表（text + bbox）。现状即目标。

---

### Step 2：Snippet Extraction — 小改

现有 `l1_analyzer.py` + `quote_consolidator.py` 已在做。改动仅一处：分析完成后调用 `snippet_registry.build_registry()`。

**EB-1A 适配：** 复制 `l1_analyzer.py` → `eb1a_analyzer.py`，替换 `L1_STANDARDS` 为 EB-1A 10 个标准。或者将 standards 配置化，放在 project 级别。

---

### Step 2.5（新增）：Snippet Linker — 从实体图推导关联信号

**新建：** `backend/app/services/snippet_linker.py`

#### 原理

现有 `relationship_analyzer.py` 产出实体图：Entity(name, type) + Relation(from, to, type)。每个实体和关系都带有 `quote_refs`（snippet 索引）。

如果两个 snippets 提到了同一个实体，它们之间就有 co-reference 关联：

```
snippet_003 ──提到──→ Entity("Nature 论文") ←──提到── snippet_007
  → 推导：snippet_003 ↔ snippet_007 关联，原因 = 共享实体 "Nature 论文"
```

**零额外 LLM 调用。** 纯内存图计算。

#### 实现

```python
"""
Snippet Linker — 从实体图推导 snippet 间关联信号

输入：relationship_analyzer 产出的实体图 + snippet_registry
输出：snippet pairs + 关联类型 + 共享实体

不调用 LLM，纯图算法。
"""

from typing import List, Dict, Tuple, Set
from collections import defaultdict
from pathlib import Path
import json

DATA_DIR = Path(__file__).parent.parent.parent / "data"
PROJECTS_DIR = DATA_DIR / "projects"


def build_snippet_links(
    graph_data: Dict,
    snippet_registry: List[Dict],
    min_shared_entities: int = 1
) -> List[Dict]:
    """
    从实体图推导 snippet 关联
    
    Args:
        graph_data: relationship_analyzer 输出 {entities, relations}
        snippet_registry: [{snippet_id, ...}]
        min_shared_entities: 至少共享几个实体才算关联
    
    Returns:
        links: [
            {
                "snippet_a": "snip_xxx",
                "snippet_b": "snip_yyy",
                "link_type": "co-reference",
                "shared_entities": ["Nature 论文", "Dr. Chen"],
                "strength": 0.8  # 共享实体数 / 两个 snippet 的平均实体数
            }
        ]
    """
    # 建立 quote_ref → snippet_id 映射
    # quote_ref 是 relationship_analyzer 里的 quote 索引
    # snippet_registry 的顺序和 quote 索引对齐
    idx_to_snippet = {}
    for i, s in enumerate(snippet_registry):
        idx_to_snippet[i] = s["snippet_id"]
    
    # 建立 entity → snippet_ids 倒排索引
    entity_to_snippets: Dict[str, Set[str]] = defaultdict(set)
    snippet_entity_count: Dict[str, int] = defaultdict(int)
    
    entities = graph_data.get("entities", [])
    for entity in entities:
        entity_name = entity.get("name", "")
        entity_id = entity.get("id", "")
        quote_refs = entity.get("quote_refs", [])
        
        for ref in quote_refs:
            ref_int = int(ref)
            if ref_int in idx_to_snippet:
                sid = idx_to_snippet[ref_int]
                entity_to_snippets[entity_name].add(sid)
                snippet_entity_count[sid] += 1
    
    # 遍历所有实体，找到共享同一实体的 snippet pairs
    pair_shared: Dict[Tuple[str, str], List[str]] = defaultdict(list)
    
    for entity_name, snippet_ids in entity_to_snippets.items():
        snippet_list = sorted(snippet_ids)
        for i in range(len(snippet_list)):
            for j in range(i + 1, len(snippet_list)):
                pair_key = (snippet_list[i], snippet_list[j])
                pair_shared[pair_key].append(entity_name)
    
    # 过滤并生成 links
    links = []
    for (sa, sb), shared in pair_shared.items():
        if len(shared) < min_shared_entities:
            continue
        
        # 计算关联强度：共享实体数 / 两个 snippet 平均实体数
        avg_entities = (snippet_entity_count.get(sa, 1) + snippet_entity_count.get(sb, 1)) / 2
        strength = min(1.0, len(shared) / max(avg_entities, 1))
        
        links.append({
            "snippet_a": sa,
            "snippet_b": sb,
            "link_type": "co-reference",
            "shared_entities": shared[:5],  # 最多列 5 个
            "strength": round(strength, 2)
        })
    
    # 按强度降序排列
    links.sort(key=lambda x: x["strength"], reverse=True)
    
    return links


def save_links(project_id: str, links: List[Dict]):
    path = PROJECTS_DIR / project_id / "snippets" / "links.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(links, f, ensure_ascii=False, indent=2)


def load_links(project_id: str) -> List[Dict]:
    path = PROJECTS_DIR / project_id / "snippets" / "links.json"
    if not path.exists():
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)
```

#### Relationship Analyzer 实体类型扩展

现有类型：`person | company | position`（面向 L-1）

扩展为（面向 EB-1A）：

```python
# relationship_analyzer.py prompt 中的 entity type 列表
"type": "person | organization | publication | award | grant | metric | event | position"
```

其中 `publication`、`award`、`grant` 对 EB-1A 最关键——律师经常需要把论文的发表记录、引用数据、和推荐信中对该论文的评价放在一起。

#### 触发时机

在 relationship analysis 完成后自动调用：

```python
# pipeline.py 中 relationship analysis 完成的回调末尾
from app.services.snippet_linker import build_snippet_links, save_links
from app.services.snippet_registry import load_registry

snippet_registry = load_registry(project_id)
graph_data = storage.load_relationship_result(project_id)
links = build_snippet_links(graph_data, snippet_registry)
save_links(project_id, links)
```

---

### Step 3：Constrained Petition Generation — 两步拆分

**核心改动：** 一次 LLM 调用 → 两次（写作 + 标注分离）

#### 3a：自由写作（Claude Sonnet）

```python
async def generate_petition_prose(
    project_id: str,
    section: str,  # e.g. "scholarly_articles"
    snippet_registry: List[Dict],
    snippet_links: List[Dict]
) -> str:
    """
    Step 3a: 自由写作，不要求 JSON，只要求写好
    Model: Claude Sonnet
    """
    # 只传入律师已映射到该 standard 的 snippets
    relevant = [s for s in snippet_registry if s["standard_key"] == section]
    
    # 构建 context：按 bundle/关联分组呈现
    context = _build_structured_context(relevant, snippet_links)
    
    prompt = f"""You are a Senior Immigration Attorney writing an EB-1A petition.

Write a persuasive, well-structured paragraph (200-400 words) for the "{section}" criterion.

Use ONLY the following evidence. Do not invent any facts.

{context}

Requirements:
- Open with a legal conclusion statement
- Present primary evidence with specific facts, dates, and figures
- Include supporting context and quantitative data
- Close with a reinforcing statement
- Professional legal tone throughout
- Reference evidence naturally (e.g. "as evidenced by..." "according to...")
"""
    
    result = await call_llm_claude(prompt, model="claude-sonnet-4-20250514")
    return result  # 纯文本段落


def _build_structured_context(
    snippets: List[Dict], 
    links: List[Dict]
) -> str:
    """
    构建给写作 LLM 的 context
    利用 snippet links 将相关 snippets 分组呈现
    让 LLM 知道哪些证据应该放在一起讨论
    """
    # 建立 snippet_id → snippet 映射
    snippet_map = {s["snippet_id"]: s for s in snippets}
    snippet_ids = set(s["snippet_id"] for s in snippets)
    
    # 用 links 做简单聚类（Union-Find）
    parent = {sid: sid for sid in snippet_ids}
    
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    
    for link in links:
        a, b = link["snippet_a"], link["snippet_b"]
        if a in snippet_ids and b in snippet_ids and link["strength"] >= 0.3:
            union(a, b)
    
    # 按 cluster 分组
    clusters = defaultdict(list)
    for sid in snippet_ids:
        clusters[find(sid)].append(sid)
    
    # 格式化输出
    lines = []
    group_num = 1
    for root, members in clusters.items():
        if len(members) > 1:
            # 找出这组共享的实体
            shared = set()
            for link in links:
                if link["snippet_a"] in members and link["snippet_b"] in members:
                    shared.update(link.get("shared_entities", []))
            
            lines.append(f"## Evidence Group {group_num} "
                         f"(related through: {', '.join(list(shared)[:3])})")
            group_num += 1
        
        for sid in members:
            s = snippet_map[sid]
            lines.append(f'  [{s["snippet_id"]}] ({s["exhibit_id"]}, p.{s["page"]}):')
            lines.append(f'  "{s["text"]}"')
            lines.append("")
    
    return "\n".join(lines)
```

#### 3b：句子级标注（GPT-4o-mini strict schema）

```python
async def annotate_sentences(
    paragraph_text: str,
    snippet_registry: List[Dict],
    section: str
) -> List[Dict]:
    """
    Step 3b: 将自由段落拆句并标注 snippet_ids
    Model: GPT-4o-mini with strict JSON schema
    """
    relevant = [s for s in snippet_registry if s["standard_key"] == section]
    
    # 构建 snippet reference list
    snippet_ref = "\n".join(
        f'[{s["snippet_id"]}]: "{s["text"][:150]}"'
        for s in relevant
    )
    
    prompt = f"""Split this paragraph into individual sentences and annotate each with the snippet IDs it draws from.

PARAGRAPH:
{paragraph_text}

AVAILABLE SNIPPETS:
{snippet_ref}

Rules:
1. Every factual claim MUST reference at least one snippet_id
2. ONLY use snippet_ids from the list above
3. Transitional/concluding sentences with no specific fact can have empty snippet_ids
4. Preserve the exact text — do not rewrite sentences
"""
    
    schema = {
        "type": "object",
        "properties": {
            "sentences": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "snippet_ids": {
                            "type": "array",
                            "items": {"type": "string"}
                        }
                    },
                    "required": ["text", "snippet_ids"]
                }
            }
        },
        "required": ["sentences"]
    }
    
    result = await call_llm_openai(
        prompt, 
        model="gpt-4o-mini",
        json_schema=schema  # strict mode, 100% 合规
    )
    return result["sentences"]
```

#### 组合调用

```python
@router.post("/write/v2/{project_id}/{section}")
async def write_petition_v2(project_id: str, section: str):
    """两步生成：写作 + 标注"""
    snippet_registry = load_registry(project_id)
    snippet_links = load_links(project_id)
    
    # 3a: 写作
    paragraph = await generate_petition_prose(
        project_id, section, snippet_registry, snippet_links
    )
    
    # 3b: 标注
    sentences = await annotate_sentences(
        paragraph, snippet_registry, section
    )
    
    # 保存
    save_constrained_writing(project_id, section, sentences, paragraph)
    
    return {
        "success": True,
        "section": section,
        "paragraph_text": paragraph,
        "sentences": sentences
    }
```

---

### Step 4：Hybrid Retrieval — provenance_engine.py

与 v1 手册相同，不再重复。核心逻辑：

- 显式 snippet_ids → confidence 1.0
- Semantic/text fallback → confidence × 0.7
- 律师编辑句子后自动触发 fallback
- 不需要 GPU：文本相似度 fallback 足够，embedding 为可选升级

---

### Step 5：BBox Highlight

与 v1 手册相同，不再重复。前端两个端点：

- `GET /provenance/{project_id}/sentence` — 正向溯源
- `GET /provenance/{project_id}/reverse` — 反向溯源

---

## 四、前端改造

### 4.1 Snippet 关联信号展示

在 Evidence Card Pool 或 Writing Canvas 中，显示 snippet 间的关联：

```tsx
// 相关 snippets 之间画一条淡色虚线
// hover 某个 snippet 时，相关 snippets 轻微高亮
// tooltip 显示 "Related through: Nature 论文, Dr. Chen"

interface SnippetLink {
  snippet_a: string;
  snippet_b: string;
  link_type: 'co-reference';
  shared_entities: string[];
  strength: number;  // 0-1
}

// 在 EvidenceCardPool 或 WritingCanvas 中
const LinkedSnippetIndicator: React.FC<{
  currentSnippetId: string;
  links: SnippetLink[];
  onHoverLink: (linkedIds: string[]) => void;
}> = ({ currentSnippetId, links, onHoverLink }) => {
  const relatedLinks = links.filter(
    l => l.snippet_a === currentSnippetId || l.snippet_b === currentSnippetId
  );
  
  if (relatedLinks.length === 0) return null;
  
  const linkedIds = relatedLinks.map(l => 
    l.snippet_a === currentSnippetId ? l.snippet_b : l.snippet_a
  );
  
  return (
    <div 
      className="text-xs text-gray-400 mt-1 cursor-pointer hover:text-blue-500"
      onMouseEnter={() => onHoverLink(linkedIds)}
      onMouseLeave={() => onHoverLink([])}
    >
      🔗 {relatedLinks.length} related snippet(s)
      <span className="text-gray-300 ml-1">
        via {relatedLinks[0].shared_entities.slice(0, 2).join(', ')}
      </span>
    </div>
  );
};
```

**交互原则：信号而非决策。** 系统只提供视觉信号（"这两个 snippet 提到了同一篇论文"），不替律师做分组决策。律师看到信号后自己判断是否把它们放在同一个 Argument 下。

### 4.2 Evidence Bundle（可选，低优先级）

如果律师觉得关联信号有用，可以手动框选 snippets 形成 bundle：

- 在 WritingCanvas 中多选几个 snippet 节点 → 右键 "Group as bundle"
- 视觉上用一个浅色背景框包裹
- bundle 传给 writing LLM 时作为一个 evidence group

这个功能在 user study 中作为 available feature 存在，在访谈 ablation 中收集反馈，不作为实验变量。

### 4.3 Sentence-level 溯源交互

与 v1 手册相同：
- WritingCanvas 中段落按句子渲染
- 点击句子 → DocumentViewer 高亮 bbox
- 不同 snippet 不同颜色
- 无溯源的过渡句灰色显示

### 4.4 前后端连接

PetitionLetter2.0 前端目前用 mock 数据。需要：
1. `src/services/api.ts` — API client，连接后端
2. `AppContext.tsx` — 替换 mock import 为 API 调用
3. 将 EB-1A 10 标准和 L-1 4 标准做成可配置

---

---

## 五、论文对齐检查

| 论文声明 | 实现 |
|---------|------|
| Step 1: Dual Indexing | `deepseek_ocr.py` → TextBlock (不变) |
| Step 2: Snippet Extraction + bbox 继承 | `l1_analyzer` + `snippet_registry.py` |
| Step 3: Structured JSON, 每句携带 snippet_ids | 3b `annotate_sentences()` strict schema |
| 只将已映射 snippet 放入 context | `_build_structured_context()` 过滤 |
| Step 4: 显式标注主 + 语义 fallback | `provenance_engine.py` |
| 显式权重 > 语义权重 | confidence 1.0 vs × 0.7 |
| Step 5: BBox Highlight <200ms | 前端 canvas overlay + 内存查询 |
| 一句→多 snippet | `resolve_provenance()` top-5 |
| 一 snippet→多句 | `/provenance/reverse` endpoint |
| deterministic + probabilistic | explicit + semantic |
| 多证据聚合是常见模式 (DP3) | snippet_linker 关联信号 + bundle UI |
| Argument 中间层 | WritingCanvas 三层节点 (已有) |

---

## 六、User Study 实验设计

### 核心对比：两种范式

Condition B 不是系统的阉割版，而是模拟律师现在真实的 AI 辅助工作流（generate-then-verify）。

```
┌─── Condition A（Extract-then-Assemble）──────────────────┐
│                                                           │
│  [源文档 PDF]  [Snippet 卡片池]  [Standards + Canvas]     │
│                                                           │
│  律师先拖拽 snippets 到 standards                          │
│  → 系统根据映射生成 petition                               │
│  → 律师在过程中已经主动接触每一条证据                        │
│  → 任务：检查 petition 中的错误                             │
│                                                           │
└───────────────────────────────────────────────────────────┘

┌─── Condition B（Generate-then-Verify）───────────────────┐
│                                                           │
│  [源文档 PDF]              [AI 生成的 petition 文本]       │
│                                                           │
│  律师直接拿到成品 petition                                 │
│  → 文中有 [Exhibit A-1, p.3] 可点击跳转到源文档            │
│  → 律师逐句阅读，逐句核实                                  │
│  → 任务：检查 petition 中的错误                             │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 信息量等价

| 维度 | Condition A | Condition B |
|------|------------|------------|
| 源文档 | ✅ 相同 exhibits | ✅ 相同 exhibits |
| Petition 文本 | ✅ 同一份 AI 生成文本 | ✅ 同一份 AI 生成文本 |
| 预埋错误 | ✅ 相同 5 个错误 | ✅ 相同 5 个错误 |
| Citation 回溯 | 句子级 → snippet → bbox | inline [Exhibit A-1, p.3] → PDF 跳转 |
| Snippet 池 | ✅ | ❌ |
| 拖拽映射 | ✅ | ❌ |
| Argument 层 | ✅ | ❌ |

**唯一差异：Condition A 律师在看到 petition 之前，经历了 assembly 过程。**

### ICAP 理论预测

- Condition B = Active engagement（浏览、点击、阅读）
- Condition A = Constructive engagement（主动建立映射关系、生成论点结构）
- ICAP 预测：Constructive > Active → Condition A 应检出更多错误

### Petition 文本来源

用 Condition A 的系统生成（两步写作 3a+3b），两组律师看到一模一样的文本。
Condition A 律师经历 assembly 后看到它；Condition B 律师直接看到它。

### Condition B 前端实现

工程量小。两个面板：

```
左栏：DocumentViewer（复用现有组件）
右栏：ReadOnlyPetitionPanel（新建，简单组件）
  - 渲染 petition 文本
  - inline citation [Exhibit A-1, p.3] 可点击
  - 点击 → 左栏 PDF 跳转到对应页
  - 律师可以在文本中标记错误（高亮 + 标注）
```

```tsx
const ReadOnlyPetitionPanel: React.FC<{
  sections: Array<{title: string, text: string, citations: Citation[]}>;
  onCitationClick: (exhibitId: string, page: number) => void;
  onMarkError: (sectionIndex: number, selection: string, errorType: string) => void;
}> = ({ sections, onCitationClick, onMarkError }) => {
  // 渲染 petition 文本
  // citation 用蓝色链接样式，点击触发 PDF 跳转
  // 右键或工具栏按钮标记错误
};
```

预估工时：4h（大部分是 citation 点击跳转逻辑）

### 实验任务

两组相同任务：

> "以下是 AI 生成的 EB-1A petition 段落和对应的源文档材料。请审阅 petition，找出其中的错误。错误可能包括：
> - 事实性错误（数字、日期、名称不一致）
> - 证据引用错误（引用了错误的 exhibit）
> - 遗漏关键证据（有证据未被引用）
> - 逻辑问题（证据不支持论点）
> 
> 请标记所有你发现的错误。"

### 量化指标

| 指标 | 含义 |
|------|------|
| Error Detection Rate | 检出的预埋错误数 / 5 |
| Precision | 正确标记 / 总标记数（含误报） |
| Time to First Error | 发现第一个错误的时间 |
| Total Task Time | 完成审阅的总时间 |
| False Positive Rate | 错误标记的非错误数 |

### 定性数据

- NASA-TLX 工作负荷量表
- 半结构化访谈（15-20 min）
- 访谈 ablation 块：
  > "系统显示了一些证据之间的关联提示。这些提示对你组织论证有帮助吗？"
  > "你有没有把几个证据手动组合在一起？为什么？"
  > "在审阅过程中，你是怎么决定去核实某句话的？"

### 被试

- N = 6-8 名移民律师（within-subjects, counterbalanced）
- 每人做两个 case（一个 Condition A，一个 Condition B）
- Case 和 Condition 的组合 counterbalance

---

## 七、Technical Evaluation（独立实验，User Study 前执行）

### 定位

TE 有两个作用：
1. **Pilot test** — 在律师参与前跑一遍完整 pipeline，发现 bug、验证可靠性
2. **防御性数据** — 论文中用 3-5 句话 + 一个小表格报告，防 reviewer 质疑

**不单独成 section。** 放在 System Design 末尾或 User Study 开头，占约四分之一页：

> *Before the user study, we validated the pipeline's technical reliability on two EB-1A cases. Snippet extraction achieved X% recall and Y% precision against expert annotations. Sentence-level provenance annotation achieved Precision@3 of Z. BBox matching yielded a mean IoU of W. These results confirmed the system was sufficiently reliable for the user study.*

### 评估哪些组件

只评估出错会破坏用户体验的组件：

| 组件 | 出错后果 | 需要评估？ |
|------|---------|-----------|
| Snippet Extraction | 律师在 snippet 池里找不到关键证据 | ✅ |
| Sentence Annotation (3b) | 点击句子看到错误的源文档位置 | ✅ |
| BBox Matching | 高亮框位置偏移 | ✅ |
| Writing (3a) | petition 文本质量 | ❌ 不是贡献点 |
| Snippet Linking | 关联提示不准 | ❌ 只是辅助信号 |

### 指标

| 组件 | 指标 | 定义 |
|------|------|------|
| Snippet Extraction | Recall | 标注的有效证据中，AI 提取了多少 |
| Snippet Extraction | Precision | AI 提取的 snippets 中，多少是有效证据 |
| Sentence Annotation | Precision@3 | 前 3 个标注 snippet 中有几个正确 |
| Sentence Annotation | MRR | 第一个正确 snippet 排在第几位 |
| BBox Matching | IoU | 系统 bbox 与 ground truth bbox 的交并比 |

### 执行方式

不需要律师参与，自己标注 ground truth。

**材料：** User study 的两套 EB-1A 案例

| 标注任务 | 内容 | 工时 |
|---------|------|------|
| Snippet Extraction GT | 读源文档，标注有效证据片段 | 2-3h / case |
| Sentence Annotation GT | 读 petition 每句话，标注该对应哪些 snippets | 1-2h / case |
| BBox GT | 在 PDF 上画出 snippet 的正确位置框 | 1-2h / case |

两个 case 合计 **1-2 天**。

### 时间线

```
Week 1-2: 系统改造（P0 + P1）
Week 3:   Technical Evaluation
             → 跑完整 pipeline
             → 标注 ground truth，计算指标
             → 发现并修复 bug（兼做 pilot test）
Week 4:   User Study（系统已验证，更稳定）
```

### 风险提示

如果某项指标很低（如 BBox IoU < 0.5），先修 bug 拉高再报告。TE 的目的是防御，不是自曝弱点。只报告好看的数据，弱项在 Limitations 里一笔带过。

### 交互日志（补充数据源）

除独立 TE 外，Condition A 前端也应记录交互日志，用于事后补充分析：

```typescript
interface InteractionLog {
  timestamp: number;
  event_type: 
    | 'snippet_drag'           // 拖拽 snippet 到 standard
    | 'mapping_confirm'        // 确认 AI 映射（dashed → solid）
    | 'mapping_reject'         // 拒绝 AI 映射
    | 'mapping_create'         // 手动创建新映射
    | 'sentence_click'         // 点击句子查看溯源
    | 'provenance_correct'     // 纠正溯源结果
    | 'error_mark'             // 标记错误
    | 'bundle_create'          // 创建 evidence bundle
    | 'bundle_modify';         // 修改 bundle
  data: {
    snippet_id?: string;
    standard_key?: string;
    sentence_index?: number;
  };
}
```

日志可提供额外的 TE 数据：律师最终映射 vs AI 初始映射的差异，作为 Snippet Extraction 和 Annotation 指标的第二数据源。

---

## 八、改造优先级（更新版）

| 优先级 | 任务 | 依赖 | 工时 |
|--------|------|------|------|
| **P0** | snippet_registry.py (Step 0) | 无 | 2h |
| **P0** | 两步写作 3a+3b (Step 3) | Step 0 | 5h |
| **P0** | call_llm_claude + call_llm_openai 接口 | 无 | 1h |
| **P1** | provenance_engine.py (Step 4) | Step 3 | 3h |
| **P1** | 前端 sentence-level 渲染 + bbox 联动 (Step 5) | Step 4 | 6h |
| **P1** | Condition B 前端 ReadOnlyPetitionPanel | 无 | 4h |
| **P1** | 预埋错误的 petition 生成 + 验证 | Step 3 | 3h |
| **P1** | relationship_analyzer 实体类型扩展 | 无 | 2h |
| **P1** | snippet_linker.py (Step 2.5) | 实体扩展 + Step 0 | 3h |
| **P1.5** | **Technical Evaluation（独立）** | P0 + P1 完成 | 10-16h |
| **P2** | 前端 snippet 关联信号展示 | Step 2.5 | 3h |
| **P2** | 反向溯源 endpoint + 前端 | Step 4 | 2h |
| **P2** | context 压缩 (compress_ocr_for_extraction) | 无 | 2h |
| **P2** | 交互日志记录 | P1 完成 | 3h |
| **P3** | 前端 evidence bundle 手动分组 | Step 2.5 | 4h |
| **P3** | EB-1A analyzer (standards 切换) | 无 | 3h |
| **P3** | 前后端 API 联调 (替换 mock) | 全部 | 4h |

### 关键路径

```
Week 1-2: P0 + P1（系统改造）
              snippet_registry → 两步写作 → provenance → 前端溯源 → Condition A
              Condition B ReadOnlyPanel
              预埋错误 petition
              snippet_linker

Week 3:   P1.5 Technical Evaluation
              跑完整 pipeline → 标注 GT → 计算指标 → 修 bug
              兼做 pilot test

Week 4:   User Study
              系统已验证，稳定运行
```

**User study ready：** P0 + P1 + P1.5 ≈ 4 周
