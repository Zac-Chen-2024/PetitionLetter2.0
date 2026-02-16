"""
Writing Router - 两步写作 API

/api/write/v2 端点
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional

from app.services.petition_writer import (
    write_petition_section,
    generate_petition_prose,
    annotate_sentences,
    save_constrained_writing,
    load_constrained_writing,
    load_all_constrained_writing,
    EB1A_STANDARDS,
    L1_STANDARDS
)
from app.services.snippet_registry import (
    load_registry,
    get_registry_stats,
    get_snippets_by_standard,
    update_snippet_standard
)
from app.services.snippet_linker import load_links

router = APIRouter(prefix="/api/write/v2", tags=["Writing V2"])


# ==================== Request/Response Models ====================

class WriteRequest(BaseModel):
    """写作请求"""
    # 可选参数，用于自定义写作
    style_template_id: Optional[str] = None
    additional_instructions: Optional[str] = None


class SentenceAnnotation(BaseModel):
    """句子标注"""
    text: str
    snippet_ids: List[str]


class WriteResponse(BaseModel):
    """写作响应"""
    success: bool
    section: str
    paragraph_text: str
    sentences: List[SentenceAnnotation]
    snippet_count: int
    version_id: Optional[str] = None


class SnippetMappingRequest(BaseModel):
    """Snippet 映射请求"""
    snippet_id: str
    standard_key: str


# ==================== Endpoints ====================

@router.post("/{project_id}/{section}", response_model=WriteResponse)
async def write_petition_v2(
    project_id: str,
    section: str,
    request: WriteRequest = None
):
    """
    两步生成：写作 + 标注

    1. 调用 GPT-4o 生成高质量段落
    2. 调用 GPT-4o-mini 进行句子级标注

    Args:
        project_id: 项目 ID
        section: 标准 key (如 "scholarly_articles", "qualifying_relationship")
    """
    try:
        # 执行两步写作
        result = await write_petition_section(project_id, section)

        # 保存结果
        version_id = save_constrained_writing(
            project_id=project_id,
            section=section,
            sentences=result["sentences"],
            paragraph_text=result["paragraph_text"]
        )

        return WriteResponse(
            success=True,
            section=section,
            paragraph_text=result["paragraph_text"],
            sentences=[SentenceAnnotation(**s) for s in result["sentences"]],
            snippet_count=result["snippet_count"],
            version_id=version_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/sections")
async def get_all_sections(project_id: str):
    """
    获取所有已生成的章节

    Returns:
        sections: {section_key: {version_id, timestamp, paragraph_text, sentences, ...}}
    """
    try:
        sections = load_all_constrained_writing(project_id)
        return {
            "success": True,
            "project_id": project_id,
            "sections": sections,
            "section_count": len(sections)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/section/{section}")
async def get_section(project_id: str, section: str, version_id: str = None):
    """
    获取单个章节的写作结果

    Args:
        version_id: 可选，不指定则返回最新版本
    """
    try:
        result = load_constrained_writing(project_id, section, version_id)
        if not result:
            raise HTTPException(status_code=404, detail=f"Section {section} not found")

        return {
            "success": True,
            "section": section,
            **result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/snippets")
async def get_project_snippets(project_id: str):
    """
    获取项目的 snippet 注册表

    Returns:
        snippets: [{snippet_id, text, exhibit_id, page, bbox, standard_key, ...}]
        stats: {total_snippets, by_standard, by_exhibit, with_bbox, bbox_coverage}
    """
    try:
        snippets = load_registry(project_id)
        stats = get_registry_stats(project_id)

        return {
            "success": True,
            "project_id": project_id,
            "snippets": snippets,
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/snippets/by-standard/{standard_key}")
async def get_snippets_for_standard(project_id: str, standard_key: str):
    """获取某个标准下的所有 snippets"""
    try:
        snippets = get_snippets_by_standard(project_id, standard_key)
        return {
            "success": True,
            "standard_key": standard_key,
            "snippets": snippets,
            "count": len(snippets)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/snippets/map")
async def map_snippet_to_standard(
    project_id: str,
    request: SnippetMappingRequest
):
    """
    将 snippet 映射到某个标准

    用于律师手动调整 snippet 的 standard_key
    """
    try:
        result = update_snippet_standard(
            project_id=project_id,
            snippet_id=request.snippet_id,
            new_standard_key=request.standard_key
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Snippet {request.snippet_id} not found"
            )

        return {
            "success": True,
            "snippet_id": request.snippet_id,
            "new_standard_key": request.standard_key
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/links")
async def get_snippet_links(project_id: str):
    """
    获取 snippet 关联信息

    Returns:
        links: [{snippet_a, snippet_b, link_type, shared_entities, strength}]
    """
    try:
        links = load_links(project_id)
        return {
            "success": True,
            "project_id": project_id,
            "links": links,
            "link_count": len(links)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/standards")
async def get_available_standards():
    """
    获取可用的法律标准列表

    Returns:
        eb1a: EB-1A 10 个标准
        l1: L-1 4 个标准
    """
    return {
        "eb1a": EB1A_STANDARDS,
        "l1": L1_STANDARDS
    }
