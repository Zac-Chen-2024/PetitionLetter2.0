"""
Analysis Router - 证据提取和分析 API

Endpoints:
- POST /api/analysis/extract/{project_id} - 提取项目所有证据 snippets
- POST /api/analysis/extract/{project_id}/{exhibit_id} - 提取单个 exhibit 的 snippets
- GET /api/analysis/{project_id}/snippets - 获取提取的 snippets
- GET /api/analysis/{project_id}/snippets/stats - 获取 snippets 统计
- PUT /api/analysis/{project_id}/snippets/{snippet_id}/standard - 更新 snippet 分类
- GET /api/analysis/{project_id}/stage - 获取 pipeline 阶段
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Dict, Optional
from pydantic import BaseModel
from datetime import datetime

from ..services.snippet_extractor import (
    extract_all_snippets,
    extract_snippets_for_exhibit,
    load_extracted_snippets,
    save_extracted_snippets,
    get_snippets_by_standard,
    get_unclassified_snippets,
    get_project_pipeline_stage,
    update_project_pipeline_stage,
    EB1A_STANDARDS
)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


# ============================================
# Request/Response Models
# ============================================

class ExtractionRequest(BaseModel):
    pass  # 现在默认使用 OpenAI LLM 提取


class ExtractionResult(BaseModel):
    success: bool
    project_id: str
    snippet_count: int
    skipped_count: int      # 跳过的已提取文档数
    extracted_count: int    # 新提取的文档数
    by_standard: Dict[str, int]
    message: str


class SnippetUpdate(BaseModel):
    standard_key: str
    is_confirmed: bool = True


class PipelineStage(BaseModel):
    stage: str
    can_extract: bool
    can_confirm: bool
    can_generate: bool


# ============================================
# Extraction Endpoints
# ============================================

@router.post("/extract/{project_id}", response_model=ExtractionResult)
async def extract_project_snippets(
    project_id: str,
    skip_existing: bool = True  # 是否跳过已提取的文档（节省 API credits）
):
    """
    提取项目所有 exhibit 的证据 snippets

    这是 Pipeline Step 2 的核心操作。
    从 OCR text_blocks 中提取有意义的证据片段，并分配 EB-1A 标准类别。

    Args:
        project_id: 项目 ID
        skip_existing: 是否跳过已提取的文档（默认 True，节省 API credits）
    """
    try:
        result = await extract_all_snippets(project_id, skip_existing=skip_existing)

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Extraction failed"))

        skipped = result.get("skipped_count", 0)
        extracted = result.get("extracted_count", 0)

        return ExtractionResult(
            success=True,
            project_id=project_id,
            snippet_count=result["snippet_count"],
            skipped_count=skipped,
            extracted_count=extracted,
            by_standard=result["by_standard"],
            message=f"Extracted {extracted} new documents, skipped {skipped} existing. Total: {result['snippet_count']} snippets"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract/{project_id}/{exhibit_id}")
async def extract_exhibit_snippets(project_id: str, exhibit_id: str):
    """
    提取单个 exhibit 的证据 snippets 并保存到 registry
    """
    try:
        snippets = await extract_snippets_for_exhibit(project_id, exhibit_id)

        # 加载现有 snippets 并合并
        existing = load_extracted_snippets(project_id)

        # 过滤掉同一 exhibit 的旧 snippets
        filtered = [s for s in existing if s.get("exhibit_id") != exhibit_id]

        # 添加新提取的 snippets
        all_snippets = filtered + snippets

        # 保存到 extracted_snippets.json
        save_extracted_snippets(project_id, all_snippets)

        return {
            "success": True,
            "project_id": project_id,
            "exhibit_id": exhibit_id,
            "snippet_count": len(snippets),
            "snippets": snippets
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Snippet Query Endpoints
# ============================================

@router.get("/{project_id}/snippets")
async def get_snippets(
    project_id: str,
    standard_key: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """
    获取提取的 snippets

    Args:
        project_id: 项目 ID
        standard_key: 可选，按标准过滤
        limit: 返回数量限制
        offset: 偏移量
    """
    if standard_key:
        snippets = get_snippets_by_standard(project_id, standard_key)
    else:
        snippets = load_extracted_snippets(project_id)

    total = len(snippets)
    paginated = snippets[offset:offset + limit]

    return {
        "project_id": project_id,
        "total": total,
        "offset": offset,
        "limit": limit,
        "standard_key": standard_key,
        "snippets": paginated
    }


@router.get("/{project_id}/snippets/unclassified")
async def get_unclassified(project_id: str):
    """获取未分类的 snippets"""
    snippets = get_unclassified_snippets(project_id)
    return {
        "project_id": project_id,
        "count": len(snippets),
        "snippets": snippets
    }


@router.get("/{project_id}/snippets/stats")
async def get_snippets_stats(project_id: str):
    """获取 snippets 统计信息"""
    snippets = load_extracted_snippets(project_id)

    if not snippets:
        return {
            "project_id": project_id,
            "total": 0,
            "by_standard": {},
            "confirmed": 0,
            "ai_suggested": 0
        }

    by_standard = {}
    confirmed = 0
    ai_suggested = 0

    for s in snippets:
        std = s.get("standard_key", "unclassified")
        by_standard[std] = by_standard.get(std, 0) + 1

        if s.get("is_confirmed"):
            confirmed += 1
        if s.get("is_ai_suggested"):
            ai_suggested += 1

    return {
        "project_id": project_id,
        "total": len(snippets),
        "by_standard": by_standard,
        "confirmed": confirmed,
        "ai_suggested": ai_suggested,
        "confirmation_rate": round(confirmed / len(snippets) * 100, 1) if snippets else 0
    }


@router.get("/{project_id}/snippets/by-standard")
async def get_snippets_grouped_by_standard(project_id: str):
    """获取按标准分组的 snippets"""
    snippets = load_extracted_snippets(project_id)

    grouped = {}
    for s in snippets:
        std = s.get("standard_key", "unclassified")
        if std not in grouped:
            grouped[std] = []
        grouped[std].append(s)

    # 添加标准元数据
    result = {}
    for std_key, std_info in EB1A_STANDARDS.items():
        result[std_key] = {
            "name": std_info["name"],
            "name_cn": std_info["name_cn"],
            "description": std_info["description"],
            "snippets": grouped.get(std_key, []),
            "count": len(grouped.get(std_key, []))
        }

    # 添加未分类
    if "unclassified" in grouped:
        result["unclassified"] = {
            "name": "Unclassified",
            "name_cn": "未分类",
            "description": "Snippets that have not been classified to any standard",
            "snippets": grouped["unclassified"],
            "count": len(grouped["unclassified"])
        }

    return {
        "project_id": project_id,
        "standards": result
    }


# ============================================
# Snippet Update Endpoints
# ============================================

@router.put("/{project_id}/snippets/{snippet_id}/standard")
async def update_snippet_standard(
    project_id: str,
    snippet_id: str,
    update: SnippetUpdate
):
    """
    更新 snippet 的标准分类

    律师可以调整 AI 建议的分类
    """
    snippets = load_extracted_snippets(project_id)

    found = False
    for s in snippets:
        if s.get("snippet_id") == snippet_id:
            s["standard_key"] = update.standard_key
            s["is_confirmed"] = update.is_confirmed
            s["confirmed_at"] = datetime.now().isoformat()
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")

    # 保存更新
    from ..services.snippet_extractor import save_extracted_snippets
    save_extracted_snippets(project_id, snippets)

    return {
        "success": True,
        "snippet_id": snippet_id,
        "standard_key": update.standard_key,
        "is_confirmed": update.is_confirmed
    }


@router.post("/{project_id}/snippets/confirm-all")
async def confirm_all_mappings(project_id: str):
    """确认所有 AI 建议的映射"""
    snippets = load_extracted_snippets(project_id)

    confirmed_count = 0
    for s in snippets:
        if not s.get("is_confirmed") and s.get("standard_key"):
            s["is_confirmed"] = True
            s["confirmed_at"] = datetime.now().isoformat()
            confirmed_count += 1

    from ..services.snippet_extractor import save_extracted_snippets
    save_extracted_snippets(project_id, snippets)

    # 更新 pipeline 阶段
    update_project_pipeline_stage(project_id, "mapping_confirmed")

    return {
        "success": True,
        "confirmed_count": confirmed_count,
        "message": f"Confirmed {confirmed_count} mappings"
    }


# ============================================
# Pipeline Stage Endpoints
# ============================================

@router.get("/{project_id}/stage", response_model=PipelineStage)
async def get_pipeline_stage(project_id: str):
    """获取项目当前 pipeline 阶段"""
    stage = get_project_pipeline_stage(project_id)

    return PipelineStage(
        stage=stage,
        can_extract=stage == "ocr_complete",
        can_confirm=stage == "snippets_ready",
        can_generate=stage == "mapping_confirmed"
    )


@router.put("/{project_id}/stage/{new_stage}")
async def set_pipeline_stage(project_id: str, new_stage: str):
    """手动设置 pipeline 阶段 (调试用)"""
    valid_stages = [
        "ocr_complete",
        "extracting",
        "snippets_ready",
        "confirming",
        "mapping_confirmed",
        "generating",
        "petition_ready"
    ]

    if new_stage not in valid_stages:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid stage. Valid stages: {valid_stages}"
        )

    update_project_pipeline_stage(project_id, new_stage)

    return {
        "success": True,
        "project_id": project_id,
        "stage": new_stage
    }


# ============================================
# EB-1A Standards Info
# ============================================

@router.get("/standards")
async def get_eb1a_standards():
    """获取 EB-1A 8 个法律标准信息"""
    return {
        "standards": [
            {
                "key": key,
                "name": info["name"],
                "name_cn": info["name_cn"],
                "description": info["description"]
            }
            for key, info in EB1A_STANDARDS.items()
        ]
    }
