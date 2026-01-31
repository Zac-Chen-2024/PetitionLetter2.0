"""
L-1 Analyzer Service - L-1 签证专项分析服务

功能:
- 针对 L-1 签证 4 大核心标准的专项提取
- 语义感知的智能文档分组
- 每个语义组单独分析
- 返回结构化的引用信息
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pathlib import Path
import json
import re

# =============================================
# 语义分组配置
# =============================================
LONG_DOC_THRESHOLD = 40000   # 40K 字符触发语义分组模式
MAX_PAGE_GROUP_SIZE = 30000  # 每组最大 30K 字符

# 语义类型定义（按优先级排序）
SEMANTIC_PATTERNS = [
    # (类型名, 正则表达式, 描述)
    ("form_1120", r"(?i)(Form\s*1120|U\.?S\.?\s*Corporation\s*Income\s*Tax\s*Return)", "IRS Form 1120 主表"),
    ("schedule", r"(?i)Schedule\s+[A-Z](?:\s|$|-)", "IRS Schedule 附表"),
    ("form_other", r"(?i)Form\s+\d+(-[A-Z]+)?", "其他 IRS 表格"),
    ("exhibit_cover", r"(?i)Exhibit\s+[A-Z]-\d+", "Exhibit 封面"),
    ("chapter", r"^\s*\d+\.\s+[A-Z]", "章节标题"),
    ("org_chart", r"(?i)(org(anization(al)?)?\s*chart|reporting\s*structure)", "组织架构图"),
    ("financial", r"(?i)(financial\s*(statement|projection|summary)|balance\s*sheet|income\s*statement)", "财务报表"),
    ("business_plan", r"(?i)(business\s*plan|executive\s*summary|market\s*analysis)", "商业计划"),
    ("contract", r"(?i)(agreement|contract|lease|memorandum)", "合同/协议"),
    ("generic", r".*", "通用内容")  # 默认类型
]

# 语义类型专用提示
SEMANTIC_TYPE_HINTS = {
    "form_1120": "Focus on: Gross receipts, Total income, Total assets, Tax amounts",
    "schedule": "Focus on: Schedule-specific data (dividends, deductions, etc.)",
    "financial": "Focus on: Revenue figures, profit margins, asset values, projections",
    "org_chart": "Focus on: Job titles, reporting structure, employee counts",
    "business_plan": "Focus on: Business strategy, market analysis, growth projections",
    "contract": "Focus on: Parties involved, terms, dates, amounts",
    "exhibit_cover": "Focus on: Document identifier, exhibit number",
    "form_other": "Focus on: Form-specific data fields",
    "chapter": "Focus on: Section content as indicated by chapter title",
    "generic": "Extract all relevant L-1 evidence"
}


def clean_ocr_for_llm(ocr_text: str) -> str:
    """
    临时清理 OCR 文本用于 LLM 分析

    只移除 DeepSeek-OCR 的调试输出，保留所有实际内容。
    原始数据库中的 ocr_text 和 text_blocks 不受影响，
    确保后续 BBox 匹配和回溯功能正常。

    Args:
        ocr_text: 原始 OCR 文本

    Returns:
        清理后的文本（仅用于发送给 LLM）
    """
    if not ocr_text:
        return ""

    lines = ocr_text.split('\n')
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # 跳过 DeepSeek-OCR 调试输出
        if stripped.startswith('BASE:') and 'torch.Size' in stripped:
            continue
        if stripped.startswith('PATCHES:') and 'torch.Size' in stripped:
            continue
        # 跳过空的分隔线
        if stripped == '=====================':
            continue
        cleaned.append(line)
    return '\n'.join(cleaned)


# =============================================
# 语义分组函数
# =============================================

def detect_page_type(text: str) -> Tuple[str, str]:
    """
    检测页面的语义类型

    通过正则匹配页面文本的前500字符，识别页面类型。

    Args:
        text: 页面文本内容

    Returns:
        (type_key, type_description) 元组
    """
    # 只检查前500字符（标题通常在开头）
    header_text = text[:500] if len(text) > 500 else text

    for type_key, pattern, description in SEMANTIC_PATTERNS:
        if type_key == "generic":
            continue  # 跳过 generic，作为最后的默认
        if re.search(pattern, header_text, re.MULTILINE):
            return (type_key, description)

    return ("generic", "通用内容")


def should_use_page_mode(project_id: str, doc_id: str, total_chars: int) -> bool:
    """
    判断是否使用页面分组模式

    条件：
    1. 文档长度超过阈值
    2. 存在页面级 OCR 数据
    """
    base_dir = Path(__file__).parent.parent.parent / "data" / "projects"
    pages_dir = base_dir / project_id / "ocr_pages" / doc_id

    has_pages = pages_dir.exists() and len(list(pages_dir.glob("page_*.json"))) > 1
    return has_pages and total_chars > LONG_DOC_THRESHOLD


def load_ocr_pages(project_id: str, doc_id: str) -> List[Dict]:
    """
    加载页面级 OCR 数据，并检测每页的语义类型

    Args:
        project_id: 项目 ID
        doc_id: 文档 ID

    Returns:
        [{"page_number": 1, "text": "...", "char_count": 5000,
          "semantic_type": "form_1120", "type_desc": "IRS Form 1120 主表"}, ...]
    """
    base_dir = Path(__file__).parent.parent.parent / "data" / "projects"
    pages_dir = base_dir / project_id / "ocr_pages" / doc_id

    if not pages_dir.exists():
        return []

    pages = []
    for f in sorted(pages_dir.iterdir()):
        if f.name.startswith("page_") and f.suffix == ".json":
            with open(f) as fp:
                data = json.load(fp)
                text = data.get("markdown_text", "")
                # 清理 OCR 调试输出
                cleaned_text = clean_ocr_for_llm(text)
                semantic_type, type_desc = detect_page_type(cleaned_text)
                pages.append({
                    "page_number": data["page_number"],
                    "text": cleaned_text,
                    "char_count": len(cleaned_text),
                    "semantic_type": semantic_type,
                    "type_desc": type_desc
                })

    return sorted(pages, key=lambda p: p["page_number"])


def group_pages_semantically(pages: List[Dict], max_chars: int = MAX_PAGE_GROUP_SIZE) -> List[Dict]:
    """
    按语义类型智能分组页面

    核心逻辑：
    1. 连续的同类型页面合并为一组（如 Schedule C 跨两页）
    2. 不同类型页面之间自然分组
    3. 如果单个语义组超过 max_chars，再按字符数细分

    Args:
        pages: 带有 semantic_type 的页面列表
        max_chars: 每组最大字符数

    Returns:
        [{"group_id": 1, "pages": [1,2], "text": "...", "page_range": "1-2",
          "semantic_type": "form_1120", "type_desc": "IRS Form 1120 主表"}, ...]
    """
    if not pages:
        return []

    # 第一步：按语义类型初步分组（连续同类型合并）
    semantic_groups = []
    current_group = {
        "pages": [pages[0]["page_number"]],
        "texts": [pages[0]["text"]],
        "char_count": pages[0]["char_count"],
        "semantic_type": pages[0]["semantic_type"],
        "type_desc": pages[0]["type_desc"]
    }

    for i in range(1, len(pages)):
        page = pages[i]
        prev_type = current_group["semantic_type"]
        curr_type = page["semantic_type"]

        # 判断是否应该开始新组
        should_split = False

        # 规则1: 类型不同时分组（但 generic 可以合并到前一组）
        if curr_type != prev_type and curr_type != "generic":
            should_split = True

        # 规则2: 遇到新的 Form/Schedule/Exhibit 时强制分组
        if curr_type in ("form_1120", "form_other", "schedule", "exhibit_cover"):
            should_split = True

        # 规则3: 当前组已超过阈值时分组
        if current_group["char_count"] + page["char_count"] > max_chars:
            should_split = True

        if should_split and current_group["pages"]:
            semantic_groups.append(current_group.copy())
            current_group = {
                "pages": [],
                "texts": [],
                "char_count": 0,
                "semantic_type": page["semantic_type"],
                "type_desc": page["type_desc"]
            }

        current_group["pages"].append(page["page_number"])
        current_group["texts"].append(page["text"])
        current_group["char_count"] += page["char_count"]

    # 添加最后一组
    if current_group["pages"]:
        semantic_groups.append(current_group)

    # 第二步：如果单个语义组仍超过阈值，按字符数细分
    final_groups = []
    for sg in semantic_groups:
        if sg["char_count"] <= max_chars:
            final_groups.append(sg)
        else:
            # 需要细分这个大组
            sub_group = {"pages": [], "texts": [], "char_count": 0}
            for i, page_num in enumerate(sg["pages"]):
                page_text = sg["texts"][i]
                page_chars = len(page_text)

                if sub_group["char_count"] + page_chars > max_chars and sub_group["pages"]:
                    final_groups.append({
                        **sub_group,
                        "semantic_type": sg["semantic_type"],
                        "type_desc": sg["type_desc"]
                    })
                    sub_group = {"pages": [], "texts": [], "char_count": 0}

                sub_group["pages"].append(page_num)
                sub_group["texts"].append(page_text)
                sub_group["char_count"] += page_chars

            if sub_group["pages"]:
                final_groups.append({
                    **sub_group,
                    "semantic_type": sg["semantic_type"],
                    "type_desc": sg["type_desc"]
                })

    # 第三步：格式化输出
    result = []
    for i, g in enumerate(final_groups):
        page_range = f"{g['pages'][0]}" if len(g['pages']) == 1 else f"{g['pages'][0]}-{g['pages'][-1]}"
        result.append({
            "group_id": i + 1,
            "pages": g["pages"],
            "text": "\n\n".join(g["texts"]),
            "char_count": g["char_count"],
            "page_range": page_range,
            "semantic_type": g["semantic_type"],
            "type_desc": g["type_desc"]
        })

    return result


# L-1 签证 4 大核心标准
L1_STANDARDS = {
    "qualifying_relationship": {
        "chinese": "合格的公司关系",
        "english": "Qualifying Corporate Relationship",
        "description": "美国公司与海外公司必须是母/子/分/关联公司关系",
        "keywords": ["母公司", "子公司", "关联公司", "分公司", "所有权", "股权", "持股", "控股", "共同控制"]
    },
    "qualifying_employment": {
        "chinese": "海外合格任职",
        "english": "Qualifying Employment Abroad",
        "description": "受益人过去3年中在海外关联公司连续工作至少1年",
        "keywords": ["任职", "工作", "职位", "入职", "离职", "任期", "年限", "海外", "境外"]
    },
    "qualifying_capacity": {
        "chinese": "合格的职位性质",
        "english": "Qualifying Capacity",
        "description": "L-1A: 高管/经理; L-1B: 专业知识人员",
        "keywords": ["高管", "经理", "管理", "决策", "战略", "专业知识", "专有技术", "指导", "监督", "人事权", "预算"]
    },
    "doing_business": {
        "chinese": "持续运营",
        "english": "Doing Business",
        "description": "美国和海外公司都必须持续、积极运营",
        "keywords": ["收入", "利润", "员工", "雇员", "银行", "存款", "合同", "业务", "办公", "注册"]
    }
}


def get_l1_analysis_prompt(doc_info: Dict[str, Any]) -> str:
    """
    生成 L-1 专项分析的提示词（支持整文档和语义分组模式）

    参数:
    - doc_info: 文档信息 {exhibit_id, file_name, text, page_group_id?, semantic_type?, page_range?}

    返回: 格式化的提示词
    """
    exhibit_id = doc_info.get("exhibit_id", "X-1")
    file_name = doc_info.get("file_name", "unknown")
    document_text = doc_info.get("text", "")

    # 语义分组上下文（如果存在）
    semantic_context = ""
    if doc_info.get("page_group_id"):
        semantic_type = doc_info.get("semantic_type", "generic")
        semantic_desc = doc_info.get("semantic_desc", "通用内容")
        page_range = doc_info.get("page_range", "unknown")

        # 获取语义类型专用提示
        hint = SEMANTIC_TYPE_HINTS.get(semantic_type, "Extract all relevant L-1 evidence")

        semantic_context = f"""
**SEMANTIC CONTEXT:**
- This is PAGE GROUP {doc_info['page_group_id']} of a larger document
- Page Range: {page_range}
- Content Type: {semantic_desc}
- {hint}

Extract all relevant quotes from THIS section. Other sections will be analyzed separately.
"""

    prompt = f"""You are a Senior L-1 Immigration Paralegal. Your mission is to COMPREHENSIVELY extract ALL factual quotes from this document that could support an L-1 visa application.

**CRITICAL EXTRACTION RULES:**
1. Extract the EXACT text - never paraphrase or summarize
2. Extract PRECISE NUMBERS (e.g., "$741,227" not "approximately $740,000")
3. Extract ALL company/client names mentioned (e.g., "U-Tech Elevator Inc., S&Q Elevator Inc.")
4. Pay special attention to TABLES - extract exact values from table cells
5. Each distinct fact should be a separate quote

**L-1 Visa: 4 Core Legal Requirements:**

1. **Qualifying Corporate Relationship** (qualifying_relationship)
   Extract:
   - Company names (both US and foreign entities)
   - Ownership percentages (e.g., "51% ownership stake")
   - Stock amounts and share values
   - Parent/subsidiary/affiliate relationship statements
   - Shareholder names and their ownership shares
   - Articles of incorporation details

2. **Qualifying Employment Abroad** (qualifying_employment)
   Extract:
   - Foreign company name and location
   - Job titles held abroad
   - Employment start/end dates
   - Duration of employment (e.g., "3 years", "since 2019")
   - Position history and promotions
   - Salary/compensation information

3. **Qualifying Capacity** (qualifying_capacity)
   Extract:
   - Specific job duties and responsibilities
   - Management/supervisory scope (e.g., "supervises 5 employees")
   - Strategic planning and decision-making authority
   - Personnel authority (hiring, firing, performance reviews)
   - Budget control and financial authority
   - Specialized/proprietary knowledge descriptions
   - Technical expertise and qualifications

4. **Doing Business / Active Operations** (doing_business) - EXTRACT GENEROUSLY!

   **HIGH PRIORITY - Financial Data (extract EXACT numbers from tables/text):**
   - Gross receipts/revenue (e.g., "Gross receipts or sales: 741,227")
   - Net income/profit figures
   - Total assets values
   - Bank account balances
   - Sales projections by year (e.g., "$700,000 in 2025, $1,200,000 in 2026")
   - Profit margins/rates (e.g., "35% profit rate")

   **HIGH PRIORITY - Employee Data:**
   - Current employee count (e.g., "currently employs 7 employees")
   - Planned/projected headcount (e.g., "plans to hire 19 employees")
   - Payroll information
   - Organizational structure details

   **HIGH PRIORITY - Client/Partner Names:**
   - Customer company names (e.g., "U-Tech Elevator Inc., S&Q Elevator Inc.")
   - Partner/vendor names
   - Business relationship descriptions

   **Other Operations Data:**
   - Products/services offered (list specific items)
   - Entity type, status, registration dates
   - EIN, DOS ID, incorporation date
   - Business addresses, office locations
   - Lease agreements, rental amounts
   - Contracts, invoices, purchase orders

**SPECIAL INSTRUCTIONS FOR TABLES:**
- When you see a table (HTML <table> or markdown table), extract EACH relevant cell value as a separate quote
- For tax forms (Form 1120, etc.), extract: Gross receipts, Total income, Total assets, etc.
- For financial projections, extract year-by-year figures
- For org charts, extract position titles and reporting structure

{semantic_context}
**Current Document Info:**
- **Exhibit ID:** {exhibit_id}
- **File Name:** {file_name}

**Output Format (JSON):**

{{
  "quotes": [
    {{
      "standard": "标准中文名",
      "standard_key": "standard_key",
      "standard_en": "Standard English Name",
      "quote": "The EXACT text copied from the document - never paraphrase",
      "relevance": "Brief explanation of why this quote matters for L-1",
      "page": 1,
      "source": {{
        "exhibit_id": "{exhibit_id}",
        "file_name": "{file_name}"
      }}
    }}
  ]
}}

**Document Text:**
{document_text}
"""
    return prompt


def map_standard_to_key(standard_name: str) -> str:
    """
    将标准名称映射到标准 key

    参数:
    - standard_name: 标准名称 (中文或英文)

    返回: 标准 key
    """
    standard_name_lower = standard_name.lower()

    # 中文映射
    if "公司关系" in standard_name or "relationship" in standard_name_lower:
        return "qualifying_relationship"
    elif "任职" in standard_name or "employment" in standard_name_lower:
        return "qualifying_employment"
    elif "职位" in standard_name or "capacity" in standard_name_lower:
        return "qualifying_capacity"
    elif "运营" in standard_name or "business" in standard_name_lower:
        return "doing_business"
    else:
        return "other"


def parse_analysis_result(llm_response: Dict[str, Any], doc_info: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    解析 LLM 返回的分析结果（整文档模式）

    参数:
    - llm_response: LLM 返回的 JSON
    - doc_info: 原始文档信息

    返回: 标准化的引用列表
    """
    quotes = llm_response.get("quotes", [])

    # 如果 LLM 返回的是数组而不是对象
    if isinstance(llm_response, list):
        quotes = llm_response

    parsed = []
    for q in quotes:
        # 确保 standard_key 存在
        standard_key = q.get("standard_key")
        if not standard_key:
            standard_key = map_standard_to_key(q.get("standard", ""))

        # 确保 source 信息完整（整文档模式，无 chunk 字段）
        source = q.get("source", {})
        if not source:
            source = {
                "exhibit_id": doc_info.get("exhibit_id"),
                "file_name": doc_info.get("file_name")
            }

        parsed.append({
            "standard": q.get("standard", "未知标准"),
            "standard_key": standard_key,
            "standard_en": q.get("standard_en", ""),
            "quote": q.get("quote", ""),
            "relevance": q.get("relevance", ""),
            "page": q.get("page"),
            "source": source
        })

    return parsed


class ChunkAnalysisResult:
    """单个 Chunk 的分析结果"""

    def __init__(self, chunk_id: str, document_id: str, exhibit_id: str):
        self.chunk_id = chunk_id
        self.document_id = document_id
        self.exhibit_id = exhibit_id
        self.quotes: List[Dict[str, Any]] = []
        self.analyzed_at: Optional[datetime] = None
        self.model_used: Optional[str] = None
        self.error: Optional[str] = None

    def add_quotes(self, quotes: List[Dict[str, Any]]):
        self.quotes.extend(quotes)
        self.analyzed_at = datetime.utcnow()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "document_id": self.document_id,
            "exhibit_id": self.exhibit_id,
            "quotes": self.quotes,
            "analyzed_at": self.analyzed_at.isoformat() if self.analyzed_at else None,
            "model_used": self.model_used,
            "error": self.error
        }


def get_standards_info() -> Dict[str, Any]:
    """获取 L-1 标准的详细信息"""
    return {
        "standards": L1_STANDARDS,
        "count": len(L1_STANDARDS),
        "keys": list(L1_STANDARDS.keys())
    }
