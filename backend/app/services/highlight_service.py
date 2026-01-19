"""
Highlight Service - 高亮分析服务

核心功能：
1. 调用 OpenAI GPT-4o 分析文档中的重要信息
2. 将 AI 识别的文本映射到 OCR 的 BBox 坐标
3. 保存高亮结果到数据库
"""

import json
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.document import Document, TextBlock, Highlight, HighlightStatus
from app.services import bbox_matcher


# LLM 配置 - 统一使用 settings 中的配置
OPENAI_API_KEY = settings.openai_api_key
OPENAI_API_BASE = settings.openai_api_base
LLM_API_BASE = settings.llm_api_base
LLM_MODEL = settings.llm_model
HIGHLIGHT_MODEL = LLM_MODEL  # 使用统一配置的模型


def _get_llm_provider() -> str:
    """获取当前 LLM Provider（动态读取，支持运行时切换）"""
    # 延迟导入避免循环引用
    from app.routers.pipeline import get_current_llm_provider
    return get_current_llm_provider()


# 重要信息类别定义
HIGHLIGHT_CATEGORIES = {
    "company_name": "公司名称",
    "person_name": "人名",
    "date": "日期",
    "amount": "金额",
    "address": "地址",
    "position": "职位",
    "key_fact": "关键事实",
    "legal_term": "法律术语",
    "signature": "签名",
    "other": "其他"
}


async def call_openai_for_highlights(ocr_text: str, max_highlights: int = 30) -> List[Dict[str, Any]]:
    """
    调用 OpenAI GPT-4o 分析文档中的重要信息

    Args:
        ocr_text: 文档的 OCR 文本 (Markdown 格式)
        max_highlights: 最大高亮数量

    Returns:
        重要信息列表
    """
    # /no_think 禁用 Qwen3 思考模式（高光分析是简单任务，不需要深度推理）
    prompt = f"""/no_think
You are a document analysis expert. Analyze the following document and identify the most important pieces of information that should be highlighted.

**Document Content:**
{ocr_text[:12000]}  # 限制文档长度

**Your Task:**
Find the most important information in this document. Focus on:
- Company names (company_name)
- Person names (person_name)
- Important dates (date)
- Monetary amounts (amount)
- Addresses (address)
- Job titles/positions (position)
- Key facts or statements (key_fact)
- Legal terms or clauses (legal_term)
- Signatures (signature)

**CRITICAL REQUIREMENT:**
For each piece of important information, you MUST extract the EXACT text as it appears in the document.
Do NOT paraphrase or modify the text. The text must match exactly for highlighting to work.

**Return JSON format:**
{{
  "highlights": [
    {{
      "text": "The EXACT text from the document to highlight (copy verbatim)",
      "category": "company_name|person_name|date|amount|address|position|key_fact|legal_term|signature|other",
      "importance": "high|medium|low",
      "reason": "Brief explanation of why this is important",
      "page_hint": 1  // Optional: if the page number is mentioned or can be inferred
    }}
  ]
}}

Return at most {max_highlights} highlights, prioritizing the most important ones first.
"""

    # 动态获取当前 LLM Provider（支持运行时切换）
    llm_provider = _get_llm_provider()

    # 根据 LLM_PROVIDER 选择 API 配置
    if llm_provider == "ollama":
        api_base = settings.ollama_api_base
        api_key = "ollama"
        model = settings.ollama_model
    elif llm_provider == "local":
        api_base = LLM_API_BASE
        api_key = OPENAI_API_KEY or "not-needed"
        model = HIGHLIGHT_MODEL
    else:
        api_base = OPENAI_API_BASE
        api_key = OPENAI_API_KEY
        model = HIGHLIGHT_MODEL

    request_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a precise document analyzer. Return ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 4000,  # 禁用思考模式后不需要太多 tokens
    }

    # 本地模型可能不完全支持 response_format，但 vLLM 和 Ollama 支持
    if llm_provider == "ollama" or llm_provider != "local" or "qwen" in model.lower() or "deepseek" in model.lower():
        request_body["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=180.0) as client:  # 3 分钟超时
        response = await client.post(
            f"{api_base}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=request_body
        )

        if response.status_code != 200:
            raise ValueError(f"LLM API error: {response.text}")

        data = response.json()
        message = data["choices"][0]["message"]
        content = message.get("content", "")

        # Qwen3 思考模式：如果 content 为空，尝试从 reasoning 字段获取
        if not content and "reasoning" in message:
            # 从 reasoning 中提取 JSON（通常在思考结束后会有 JSON 输出）
            reasoning = message.get("reasoning", "")
            # 尝试找到 JSON 部分
            import re
            json_match = re.search(r'\{[\s\S]*"highlights"[\s\S]*\}', reasoning)
            if json_match:
                content = json_match.group()
            else:
                raise ValueError(f"Qwen3 reasoning mode returned no valid JSON. Reasoning: {reasoning[:500]}")

        if not content:
            raise ValueError("LLM returned empty content")

        try:
            result = json.loads(content)
            return result.get("highlights", [])
        except json.JSONDecodeError:
            raise ValueError(f"Failed to parse LLM response as JSON: {content[:200]}")


def match_highlights_to_bbox(
    highlights: List[Dict[str, Any]],
    text_blocks: List[TextBlock],
    similarity_threshold: float = 0.6
) -> List[Dict[str, Any]]:
    """
    将 AI 识别的高亮文本映射到 OCR 的 BBox 坐标

    Args:
        highlights: AI 返回的高亮列表
        text_blocks: 文档的 TextBlock 列表
        similarity_threshold: 匹配阈值

    Returns:
        带有 BBox 信息的高亮列表
    """
    matched_highlights = []

    for h in highlights:
        search_text = h.get("text", "")
        page_hint = h.get("page_hint")

        if not search_text:
            continue

        # 使用 bbox_matcher 进行匹配
        match_result = bbox_matcher.match_text_to_blocks(
            search_text=search_text,
            text_blocks=text_blocks,
            page_hint=page_hint,
            similarity_threshold=similarity_threshold
        )

        if match_result["matched"]:
            # 获取最佳匹配的 BBox
            best_match = match_result["matches"][0]

            matched_highlight = {
                "text_content": search_text,
                "category": h.get("category", "other"),
                "importance": h.get("importance", "medium"),
                "reason": h.get("reason", ""),
                "page_number": best_match["page_number"],
                "bbox": best_match["bbox"],
                "source_block_ids": [m["block_id"] for m in match_result["matches"]],
                "match_score": best_match["match_score"],
                "match_type": best_match["match_type"]
            }
            matched_highlights.append(matched_highlight)
        else:
            # 未匹配到 BBox，但仍保留高亮信息（用于显示在右侧列表）
            matched_highlight = {
                "text_content": search_text,
                "category": h.get("category", "other"),
                "importance": h.get("importance", "medium"),
                "reason": h.get("reason", ""),
                "page_number": page_hint or 1,
                "bbox": None,
                "source_block_ids": [],
                "match_score": 0,
                "match_type": "not_found"
            }
            matched_highlights.append(matched_highlight)

    return matched_highlights


async def analyze_and_highlight(document_id: str, db: Session) -> Dict[str, Any]:
    """
    主要入口函数：分析文档并生成高亮

    流程:
    1. 获取文档的 ocr_text
    2. 获取文档的 text_blocks
    3. 调用 OpenAI 识别重要信息
    4. 将重要信息映射到 BBox
    5. 保存 Highlight 记录

    Args:
        document_id: 文档 ID
        db: 数据库会话

    Returns:
        分析结果摘要
    """
    # 1. 获取文档
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise ValueError(f"Document not found: {document_id}")

    if not doc.ocr_text:
        raise ValueError(f"Document has no OCR text: {document_id}")

    # 2. 更新状态为处理中
    doc.highlight_status = HighlightStatus.PROCESSING.value
    db.commit()

    try:
        # 3. 获取 text_blocks
        text_blocks = db.query(TextBlock).filter(
            TextBlock.document_id == document_id
        ).order_by(TextBlock.page_number, TextBlock.block_id).all()

        if not text_blocks:
            raise ValueError(f"No text blocks found for document: {document_id}. Was OCR performed with DeepSeek-OCR?")

        # 4. 调用 OpenAI 分析
        ai_highlights = await call_openai_for_highlights(doc.ocr_text)

        # 5. 匹配 BBox
        matched_highlights = match_highlights_to_bbox(ai_highlights, text_blocks)

        # 6. 删除旧的高亮记录
        db.query(Highlight).filter(Highlight.document_id == document_id).delete()

        # 7. 保存新的高亮记录
        saved_count = 0
        for h in matched_highlights:
            bbox = h.get("bbox")
            highlight = Highlight(
                document_id=document_id,
                text_content=h["text_content"],
                importance=h["importance"],
                category=h["category"],
                reason=h.get("reason", ""),
                page_number=h["page_number"],
                bbox_x1=bbox["x1"] if bbox else None,
                bbox_y1=bbox["y1"] if bbox else None,
                bbox_x2=bbox["x2"] if bbox else None,
                bbox_y2=bbox["y2"] if bbox else None,
                source_block_ids=json.dumps(h.get("source_block_ids", []))
            )
            db.add(highlight)
            saved_count += 1

        # 8. 更新文档状态
        doc.highlight_status = HighlightStatus.COMPLETED.value
        db.commit()

        # 统计
        matched_count = sum(1 for h in matched_highlights if h.get("bbox"))

        return {
            "document_id": document_id,
            "total_highlights": saved_count,
            "matched_with_bbox": matched_count,
            "unmatched": saved_count - matched_count,
            "match_rate": round(matched_count / saved_count, 2) if saved_count > 0 else 0
        }

    except Exception as e:
        # 更新状态为失败
        doc.highlight_status = HighlightStatus.FAILED.value
        db.commit()
        raise


def get_highlights_for_document(document_id: str, db: Session, page: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    获取文档的高亮列表

    Args:
        document_id: 文档 ID
        db: 数据库会话
        page: 可选的页码过滤

    Returns:
        高亮列表
    """
    query = db.query(Highlight).filter(Highlight.document_id == document_id)

    if page is not None:
        query = query.filter(Highlight.page_number == page)

    highlights = query.order_by(Highlight.page_number, Highlight.bbox_y1).all()

    return [
        {
            "id": h.id,
            "text_content": h.text_content,
            "category": h.category,
            "category_cn": HIGHLIGHT_CATEGORIES.get(h.category, h.category),
            "importance": h.importance,
            "reason": h.reason,
            "page_number": h.page_number,
            "bbox": {
                "x1": h.bbox_x1,
                "y1": h.bbox_y1,
                "x2": h.bbox_x2,
                "y2": h.bbox_y2
            } if h.bbox_x1 is not None else None,
            "source_block_ids": json.loads(h.source_block_ids) if h.source_block_ids else []
        }
        for h in highlights
    ]


def get_highlights_by_page(document_id: str, db: Session) -> Dict[int, List[Dict[str, Any]]]:
    """
    按页码分组获取高亮

    Returns:
        {1: [highlights...], 2: [highlights...], ...}
    """
    all_highlights = get_highlights_for_document(document_id, db)

    by_page = {}
    for h in all_highlights:
        page = h["page_number"]
        if page not in by_page:
            by_page[page] = []
        by_page[page].append(h)

    return by_page
