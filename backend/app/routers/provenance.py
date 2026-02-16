"""
Provenance Router - 溯源 API

提供句子 ↔ snippet 的双向溯源能力
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional

from app.services.provenance_engine import (
    resolve_provenance,
    resolve_reverse_provenance,
    get_bbox_for_snippets,
    get_section_provenance_summary
)
from app.services.petition_writer import load_all_constrained_writing

router = APIRouter(prefix="/api/provenance", tags=["Provenance"])


# ==================== Request/Response Models ====================

class SnippetMatch(BaseModel):
    """Snippet 匹配结果"""
    snippet_id: str
    confidence: float
    match_type: str  # "explicit" | "semantic"
    text: str
    exhibit_id: str
    page: int
    bbox: Optional[Dict] = None


class ProvenanceResponse(BaseModel):
    """溯源响应"""
    sentence_index: int
    sentence_text: str
    snippets: List[SnippetMatch]
    total_matches: int


class SentenceReference(BaseModel):
    """句子引用"""
    section: str
    sentence_index: int
    sentence_text: str
    confidence: float
    match_type: str


class ReverseProvenanceResponse(BaseModel):
    """反向溯源响应"""
    snippet_id: str
    snippet_text: str
    sentences: List[SentenceReference]
    total_references: int


class BBoxInfo(BaseModel):
    """BBox 信息"""
    snippet_id: str
    exhibit_id: str
    page: int
    bbox: Dict


# ==================== Endpoints ====================

@router.get("/{project_id}/sentence", response_model=ProvenanceResponse)
async def get_sentence_provenance(
    project_id: str,
    section: str = Query(..., description="标准 key，如 'scholarly_articles'"),
    sentence_index: int = Query(..., ge=0, description="句子索引"),
    method: str = Query("hybrid", description="溯源方式: explicit | semantic | hybrid")
):
    """
    正向溯源：获取句子的来源 snippets

    Args:
        project_id: 项目 ID
        section: 标准 key
        sentence_index: 句子索引（从 0 开始）
        method: 溯源方式
            - explicit: 只返回显式标注的 snippet_ids
            - semantic: 只使用语义匹配
            - hybrid: 显式 + 语义补充

    Returns:
        句子文本 + 匹配的 snippets（带置信度和 bbox）
    """
    try:
        result = resolve_provenance(
            project_id=project_id,
            section=section,
            sentence_index=sentence_index,
            method=method
        )

        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])

        return ProvenanceResponse(
            sentence_index=result["sentence_index"],
            sentence_text=result["sentence_text"],
            snippets=[SnippetMatch(**s) for s in result["snippets"]],
            total_matches=result["total_matches"]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/reverse", response_model=ReverseProvenanceResponse)
async def get_reverse_provenance(
    project_id: str,
    snippet_id: str = Query(..., description="Snippet ID")
):
    """
    反向溯源：查找引用了某个 snippet 的所有句子

    Args:
        project_id: 项目 ID
        snippet_id: Snippet ID

    Returns:
        snippet 信息 + 引用它的所有句子
    """
    try:
        result = resolve_reverse_provenance(
            project_id=project_id,
            snippet_id=snippet_id
        )

        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])

        return ReverseProvenanceResponse(
            snippet_id=result["snippet_id"],
            snippet_text=result["snippet_text"],
            sentences=[SentenceReference(**s) for s in result["sentences"]],
            total_references=result["total_references"]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/bbox")
async def get_snippets_bbox(
    project_id: str,
    snippet_ids: str = Query(..., description="逗号分隔的 snippet IDs")
):
    """
    获取多个 snippets 的 BBox 坐标

    用于前端高亮显示

    Args:
        snippet_ids: 逗号分隔的 snippet IDs，如 "snip_xxx,snip_yyy"

    Returns:
        每个 snippet 的 bbox 信息
    """
    try:
        ids = [s.strip() for s in snippet_ids.split(",") if s.strip()]

        if not ids:
            raise HTTPException(status_code=400, detail="No snippet IDs provided")

        results = get_bbox_for_snippets(project_id, ids)

        return {
            "success": True,
            "project_id": project_id,
            "results": results,
            "found": len(results),
            "requested": len(ids)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/summary/{section}")
async def get_provenance_summary(
    project_id: str,
    section: str
):
    """
    获取 section 的溯源统计摘要

    Returns:
        - sentence_count: 句子总数
        - annotated_count: 有标注的句子数
        - coverage: 标注覆盖率
        - snippet_usage: 每个 snippet 被引用的次数
    """
    try:
        result = get_section_provenance_summary(project_id, section)

        return {
            "success": True,
            **result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/all-summaries")
async def get_all_provenance_summaries(project_id: str):
    """
    获取所有 sections 的溯源统计摘要

    Returns:
        sections: {section_key: summary}
    """
    try:
        all_writing = load_all_constrained_writing(project_id)

        summaries = {}
        for section in all_writing.keys():
            summaries[section] = get_section_provenance_summary(project_id, section)

        return {
            "success": True,
            "project_id": project_id,
            "sections": summaries,
            "section_count": len(summaries)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/section/{section}/all-sentences")
async def get_section_all_sentences_provenance(
    project_id: str,
    section: str,
    method: str = Query("hybrid", description="溯源方式")
):
    """
    获取 section 中所有句子的溯源信息

    用于前端一次性加载整个 section 的溯源数据
    """
    try:
        all_writing = load_all_constrained_writing(project_id)
        writing = all_writing.get(section)

        if not writing:
            raise HTTPException(status_code=404, detail=f"Section {section} not found")

        sentences = writing.get("sentences", [])

        results = []
        for idx in range(len(sentences)):
            prov = resolve_provenance(
                project_id=project_id,
                section=section,
                sentence_index=idx,
                method=method
            )
            results.append({
                "sentence_index": idx,
                "sentence_text": prov.get("sentence_text", ""),
                "snippets": prov.get("snippets", []),
                "total_matches": prov.get("total_matches", 0)
            })

        return {
            "success": True,
            "section": section,
            "sentences": results,
            "total_sentences": len(results)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
