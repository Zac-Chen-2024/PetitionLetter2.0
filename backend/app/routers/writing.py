"""
Writing Router - 写作 API

/api/write/v2 端点 - 原版两步写作（Snippet 级别溯源）
/api/write/v3 端点 - SubArgument 感知写作（完整溯源链）
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


# ==================== V3 API - SubArgument 感知写作 ====================

from app.services.petition_writer_v3 import (
    write_petition_section_v3,
    load_subargument_context,
    save_writing_v3,
    load_latest_writing_v3
)

router_v3 = APIRouter(prefix="/api/write/v3", tags=["Writing V3"])


class WriteV3Request(BaseModel):
    """V3 写作请求"""
    argument_ids: Optional[List[str]] = None  # 可选，指定要生成的 Argument IDs
    subargument_ids: Optional[List[str]] = None  # 可选，指定要生成的 SubArgument IDs（用于局部重新生成）
    style: str = "legal"
    additional_instructions: Optional[str] = None


class SentenceWithProvenanceV3(BaseModel):
    """带完整溯源的句子"""
    text: str
    snippet_ids: List[str]
    subargument_id: Optional[str] = None
    argument_id: Optional[str] = None
    exhibit_refs: List[str] = []
    sentence_type: str = "body"  # opening, body, closing


class ProvenanceIndex(BaseModel):
    """溯源索引"""
    by_subargument: Dict[str, List[int]] = {}
    by_argument: Dict[str, List[int]] = {}
    by_snippet: Dict[str, List[int]] = {}


class ValidationResult(BaseModel):
    """验证结果"""
    total_sentences: int
    traced_sentences: int
    warnings: List[str] = []


class WriteV3Response(BaseModel):
    """V3 写作响应"""
    success: bool
    section: str
    paragraph_text: str
    sentences: List[SentenceWithProvenanceV3]
    provenance_index: ProvenanceIndex
    validation: ValidationResult
    error: Optional[str] = None


@router_v3.post("/{project_id}/{standard_key}", response_model=WriteV3Response)
async def write_petition_v3(
    project_id: str,
    standard_key: str,
    request: WriteV3Request = None
):
    """
    V3 写作端点 - SubArgument 感知的写作

    基于 SubArgument 结构生成内容，输出包含完整溯源链：
    句子 → SubArgument → Argument → Standard

    Args:
        project_id: 项目 ID
        standard_key: 标准 key (如 "membership", "leading_role")
        request: 写作请求参数

    Returns:
        WriteV3Response: 包含段落文本、句子列表、溯源索引
    """
    try:
        req = request or WriteV3Request()

        # 执行 V3 写作
        result = await write_petition_section_v3(
            project_id=project_id,
            standard_key=standard_key,
            argument_ids=req.argument_ids,
            subargument_ids=req.subargument_ids,
            additional_instructions=req.additional_instructions
        )

        if not result.get("success"):
            return WriteV3Response(
                success=False,
                section=standard_key,
                paragraph_text="",
                sentences=[],
                provenance_index=ProvenanceIndex(),
                validation=ValidationResult(total_sentences=0, traced_sentences=0),
                error=result.get("error", "Unknown error")
            )

        # 保存结果
        save_writing_v3(project_id, standard_key, result)

        return WriteV3Response(
            success=True,
            section=result["section"],
            paragraph_text=result["paragraph_text"],
            sentences=[SentenceWithProvenanceV3(**s) for s in result["sentences"]],
            provenance_index=ProvenanceIndex(**result.get("provenance_index", {})),
            validation=ValidationResult(**result.get("validation", {}))
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router_v3.get("/{project_id}/{standard_key}")
async def get_writing_v3(project_id: str, standard_key: str):
    """
    获取已生成的 V3 写作结果
    """
    try:
        result = load_latest_writing_v3(project_id, standard_key)
        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"No V3 writing found for {standard_key}"
            )

        return {
            "success": True,
            **result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router_v3.get("/{project_id}/{standard_key}/context")
async def get_subargument_context(
    project_id: str,
    standard_key: str,
    argument_ids: str = None,
    subargument_ids: str = None
):
    """
    获取用于写作的 SubArgument 上下文

    用于调试和预览将要发送给 LLM 的数据
    """
    try:
        arg_ids = argument_ids.split(",") if argument_ids else None
        subarg_ids = subargument_ids.split(",") if subargument_ids else None
        context = load_subargument_context(project_id, standard_key, arg_ids, subarg_ids)

        return {
            "success": True,
            "context": context,
            "argument_count": len(context.get("arguments", [])),
            "subargument_count": sum(
                len(a.get("sub_arguments", []))
                for a in context.get("arguments", [])
            )
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Edit Endpoint ====================

class ChatMessageIn(BaseModel):
    """对话消息"""
    role: str  # 'user' or 'assistant'
    content: str


class EditRequest(BaseModel):
    """编辑请求"""
    section_id: str
    original_text: str
    instruction: str
    conversation_history: List[ChatMessageIn] = []


class EditResponse(BaseModel):
    """编辑响应"""
    success: bool
    revised_text: str
    explanation: Optional[str] = None
    error: Optional[str] = None


@router_v3.post("/{project_id}/edit", response_model=EditResponse)
async def edit_text_with_ai(
    project_id: str,
    request: EditRequest
):
    """
    AI 辅助文本编辑

    支持多轮对话，根据用户指令修改选中的文本。

    Args:
        project_id: 项目 ID
        request: 编辑请求，包含原文、指令和对话历史

    Returns:
        EditResponse: 修改后的文本和说明
    """
    try:
        from app.services.petition_writer_v3 import edit_text_with_instruction

        result = await edit_text_with_instruction(
            project_id=project_id,
            original_text=request.original_text,
            instruction=request.instruction,
            conversation_history=[
                {"role": m.role, "content": m.content}
                for m in request.conversation_history
            ]
        )

        return EditResponse(
            success=True,
            revised_text=result.get("revised_text", ""),
            explanation=result.get("explanation")
        )

    except Exception as e:
        return EditResponse(
            success=False,
            revised_text="",
            error=str(e)
        )
