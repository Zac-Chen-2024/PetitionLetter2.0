"""
Arguments Router - AI 论据组装 API

Endpoints:
- POST /api/arguments/{project_id}/generate - 一键生成论据
- GET /api/arguments/{project_id}/status - 获取生成状态
- GET /api/arguments/{project_id} - 获取生成的论据列表
- GET /api/arguments/{project_id}/relationship - 获取关系图数据
- PUT /api/arguments/{project_id}/{argument_id} - 更新论据
- DELETE /api/arguments/{project_id}/{argument_id} - 删除论据
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Optional
from pydantic import BaseModel

from ..services.argument_generator import (
    ArgumentGenerator,
    generate_arguments_for_project
)
from ..services.argument_qualifier import (
    qualify_all_arguments,
    get_qualification_summary
)
from ..services.argument_composer import (
    compose_project_arguments,
    ArgumentComposer
)
from ..services.entity_analyzer import (
    analyze_project_entities,
    load_project_metadata
)
from ..services.legal_argument_organizer import (
    full_legal_pipeline
)
from dataclasses import asdict
import json
from datetime import datetime
from pathlib import Path

router = APIRouter(prefix="/api/arguments", tags=["arguments"])


# ============================================
# Request/Response Models
# ============================================

class GenerateRequest(BaseModel):
    force_reanalyze: bool = False
    applicant_name: Optional[str] = None
    provider: str = "deepseek"  # LLM provider: "deepseek" or "openai"


class ArgumentResponse(BaseModel):
    id: str
    title: str
    subject: str
    snippet_ids: List[str]
    standard_key: str
    confidence: float
    created_at: str
    is_ai_generated: bool


class GenerateResponse(BaseModel):
    success: bool
    main_subject: Optional[str]
    argument_count: int
    arguments: List[ArgumentResponse]
    stats: Dict


class StatusResponse(BaseModel):
    has_relationship_analysis: bool
    has_generated_arguments: bool
    argument_count: int
    main_subject: Optional[str]
    generated_at: Optional[str]


class ArgumentUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    snippet_ids: Optional[List[str]] = None
    standard_key: Optional[str] = None


# ============================================
# Generation Endpoints
# ============================================

@router.post("/{project_id}/generate", response_model=GenerateResponse)
async def generate_arguments(
    project_id: str,
    request: GenerateRequest = GenerateRequest()
):
    """
    一键生成论据 (LLM + 法律条例驱动)

    Pipeline:
    1. LLM + 法律条例 → 组织子论点 (~7-8个，符合律师论证风格)
    2. LLM → 划分次级子论点 (每个2-4个 SubArguments)
    3. 智能过滤弱证据（如普通认证）

    Args:
        project_id: 项目 ID
        force_reanalyze: 是否强制重新生成
        applicant_name: 申请人姓名
        provider: LLM provider (deepseek/openai)
    """
    try:
        # 使用新的 LLM + 法律条例驱动流程
        result = await full_legal_pipeline(
            project_id=project_id,
            applicant_name=request.applicant_name or "the applicant",
            provider=request.provider
        )

        return GenerateResponse(
            success=True,
            main_subject=request.applicant_name,
            argument_count=result.get("stats", {}).get("argument_count", 0),
            arguments=result.get("arguments", []),
            stats=result.get("stats", {})
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/status", response_model=StatusResponse)
async def get_generation_status(project_id: str):
    """
    获取论据生成状态

    返回:
    - has_relationship_analysis: 是否已完成关系分析
    - has_generated_arguments: 是否已生成论据
    - argument_count: 论据数量
    - main_subject: 识别的主体（申请人）
    - generated_at: 生成时间
    """
    generator = ArgumentGenerator(project_id)
    status = generator.get_generation_status()

    return StatusResponse(**status)


# ============================================
# Arguments CRUD
# ============================================

@router.get("/{project_id}")
async def get_arguments(project_id: str, include_qualification: bool = False):
    """
    获取生成的论据列表

    Args:
        project_id: 项目 ID
        include_qualification: 是否包含资格检查结果

    Returns:
        - arguments: 论据列表 (LLM + 法律条例生成的精华子论点)
        - sub_arguments: 次级子论点列表
        - main_subject: 识别的主体（申请人）
        - generated_at: 生成时间
        - stats: 统计信息
        - filtered: 过滤掉的弱证据
    """
    # 优先读取新的 legal_arguments.json
    projects_dir = Path(__file__).parent.parent.parent / "data" / "projects"
    legal_file = projects_dir / project_id / "arguments" / "legal_arguments.json"

    result = None
    if legal_file.exists():
        with open(legal_file, 'r', encoding='utf-8') as f:
            result = json.load(f)

    # Fallback: 读取旧格式
    if not result:
        generator = ArgumentGenerator(project_id)
        result = generator.load_generated_arguments()

    if not result:
        return {
            "project_id": project_id,
            "arguments": [],
            "sub_arguments": [],
            "main_subject": None,
            "generated_at": None
        }

    arguments = result.get("arguments", [])
    sub_arguments = result.get("sub_arguments", [])
    filtered = result.get("filtered", [])

    # 如果需要包含资格检查
    if include_qualification:
        generator = ArgumentGenerator(project_id)
        snippets = generator.load_snippets()
        arguments = qualify_all_arguments(arguments, snippets)
        qual_summary = get_qualification_summary(arguments)
    else:
        qual_summary = None

    return {
        "project_id": project_id,
        "arguments": arguments,
        "sub_arguments": sub_arguments,
        "main_subject": result.get("main_subject"),
        "generated_at": result.get("generated_at"),
        "stats": result.get("stats", {}),
        "filtered": filtered,
        "qualification_summary": qual_summary
    }


@router.put("/{project_id}/{argument_id}")
async def update_argument(
    project_id: str,
    argument_id: str,
    update: ArgumentUpdate
):
    """
    更新论据

    可更新字段:
    - title: 论据标题
    - subject: 主体
    - snippet_ids: 关联的 snippet IDs
    - standard_key: 映射的标准
    """
    generator = ArgumentGenerator(project_id)
    result = generator.load_generated_arguments()

    if not result:
        raise HTTPException(status_code=404, detail="No arguments found")

    arguments = result.get("arguments", [])
    found = False

    for arg in arguments:
        if arg.get("id") == argument_id:
            if update.title is not None:
                arg["title"] = update.title
            if update.subject is not None:
                arg["subject"] = update.subject
            if update.snippet_ids is not None:
                arg["snippet_ids"] = update.snippet_ids
            if update.standard_key is not None:
                arg["standard_key"] = update.standard_key
            arg["is_ai_generated"] = False  # Mark as manually edited
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Argument not found: {argument_id}")

    # Save updated arguments
    import json
    args_file = generator.get_arguments_file()
    with open(args_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return {
        "success": True,
        "argument_id": argument_id,
        "message": "Argument updated"
    }


@router.delete("/{project_id}/{argument_id}")
async def delete_argument(project_id: str, argument_id: str):
    """
    删除论据

    Note: Due to FastAPI routing order, this route catches /subarguments/{id} requests.
    We detect and forward those to the correct handler.
    """
    # Handle misrouted subargument delete requests
    if argument_id.startswith("subarg-"):
        # Forward to subargument delete logic
        from ..services.snippet_recommender import load_legal_arguments, save_legal_arguments

        print(f"[DELETE SubArgument via fallback] project_id={project_id}, subargument_id={argument_id}")

        legal_args = load_legal_arguments(project_id)
        sub_arguments = legal_args.get("sub_arguments", [])
        arguments = legal_args.get("arguments", [])

        original_count = len(sub_arguments)
        sub_arguments = [sa for sa in sub_arguments if sa.get("id") != argument_id]

        if len(sub_arguments) == original_count:
            raise HTTPException(status_code=404, detail=f"SubArgument not found: {argument_id}")

        legal_args["sub_arguments"] = sub_arguments

        # Remove reference from parent Argument's sub_argument_ids
        for arg in arguments:
            if "sub_argument_ids" in arg and argument_id in arg["sub_argument_ids"]:
                arg["sub_argument_ids"].remove(argument_id)

        save_legal_arguments(project_id, legal_args)
        print(f"[DELETE SubArgument via fallback] Deleted successfully")

        return {
            "success": True,
            "subargument_id": argument_id,
            "message": "SubArgument deleted"
        }

    generator = ArgumentGenerator(project_id)
    result = generator.load_generated_arguments()

    if not result:
        raise HTTPException(status_code=404, detail="No arguments found")

    arguments = result.get("arguments", [])
    original_count = len(arguments)

    # Filter out the argument to delete
    arguments = [arg for arg in arguments if arg.get("id") != argument_id]

    if len(arguments) == original_count:
        raise HTTPException(status_code=404, detail=f"Argument not found: {argument_id}")

    result["arguments"] = arguments

    # Save updated arguments
    import json
    args_file = generator.get_arguments_file()
    with open(args_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return {
        "success": True,
        "argument_id": argument_id,
        "message": "Argument deleted"
    }


# ============================================
# Relationship Graph Endpoints
# ============================================

@router.get("/{project_id}/relationship")
async def get_relationship_graph(project_id: str):
    """
    获取关系图数据

    返回:
    - entities: 实体列表
    - relations: 关系列表
    - main_subject: 识别的主体（申请人）
    - attributions: snippet 归属列表
    - stats: 统计信息
    """
    generator = ArgumentGenerator(project_id)
    graph = generator.load_relationship_graph()

    if not graph:
        return {
            "project_id": project_id,
            "has_relationship_analysis": False,
            "entities": [],
            "relations": [],
            "main_subject": None,
            "attributions": [],
            "stats": {}
        }

    return {
        "project_id": project_id,
        "has_relationship_analysis": True,
        "entities": graph.get("entities", []),
        "relations": graph.get("relations", []),
        "main_subject": graph.get("main_subject"),
        "attributions": graph.get("attributions", []),
        "stats": graph.get("stats", {})
    }


@router.post("/{project_id}/relationship/analyze")
async def run_relationship_analysis(project_id: str, force: bool = False):
    """
    单独运行关系分析（不生成论据）

    用于测试或查看关系图
    """
    try:
        generator = ArgumentGenerator(project_id)
        result = await generator.run_relationship_analysis(force=force)

        return {
            "success": True,
            "entity_count": len(result.get("entities", [])),
            "relation_count": len(result.get("relations", [])),
            "stats": result.get("stats", {})
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Composed Arguments Endpoint (律师风格组合)
# ============================================

@router.get("/{project_id}/composed")
async def get_composed_arguments(
    project_id: str,
    applicant_name: str = "Ms. Qu",
    provider: str = "deepseek",
    force_analyze: bool = False
):
    """
    获取律师风格组合论点

    使用 argument_composer 将碎片化的 snippets 组合成结构化论点:
    - Membership: 按协会分组，过滤普通会员
    - Published Material: 按媒体分组
    - Original Contribution: 合并成整体
    - Leading Role: 按组织分组，合并变体
    - Awards: 合并成整体

    每个论点包含: Claim + Proof + Significance + Context + Conclusion

    **泛化改进**: 自动调用 LLM 分析实体关系，生成 project_metadata.json

    Args:
        project_id: 项目 ID
        applicant_name: 申请人姓名
        provider: LLM 提供商 (deepseek/openai)
        force_analyze: 是否强制重新分析实体
    """
    try:
        # Step 1: 分析实体关系（如果没有 metadata 或强制重新分析）
        metadata = await analyze_project_entities(
            project_id=project_id,
            applicant_name=applicant_name,
            provider=provider,
            force=force_analyze
        )

        # Step 2: 使用分析结果组合论点
        result = compose_project_arguments(project_id, applicant_name, metadata)

        # 转换成前端友好的格式 (flat list with standard_key)
        arguments = []
        for standard, args in result.get("composed", {}).items():
            for idx, arg in enumerate(args):
                # 生成唯一 ID
                arg_id = f"{standard}_{idx}"

                # 收集所有 snippet_ids
                snippet_ids = []
                for layer in ["claim", "proof", "significance", "context"]:
                    for item in arg.get(layer, []):
                        if item.get("snippet_id"):
                            snippet_ids.append(item["snippet_id"])

                arguments.append({
                    "id": arg_id,
                    "title": arg.get("title", ""),
                    "subject": arg.get("group_key", ""),
                    "standard_key": standard,
                    "snippet_ids": snippet_ids,
                    "exhibits": arg.get("exhibits", []),
                    "confidence": arg.get("completeness", {}).get("score", 0) / 100.0,
                    "is_ai_generated": True,
                    "created_at": datetime.now().isoformat(),
                    # 新增：律师风格结构
                    "layers": {
                        "claim": arg.get("claim", []),
                        "proof": arg.get("proof", []),
                        "significance": arg.get("significance", []),
                        "context": arg.get("context", [])
                    },
                    "conclusion": arg.get("conclusion", ""),
                    "completeness": arg.get("completeness", {})
                })

        # 使用 metadata 中的正式名称
        formal_name = metadata.get("applicant", {}).get("formal_name", applicant_name)

        return {
            "project_id": project_id,
            "arguments": arguments,
            "main_subject": formal_name,
            "generated_at": datetime.now().isoformat(),
            "stats": result.get("statistics", {}),
            "lawyer_output": result.get("lawyer_output", ""),
            # 新增：实体分析信息
            "entity_analysis": {
                "provider": metadata.get("_metadata", {}).get("provider", "unknown"),
                "entity_count": metadata.get("_metadata", {}).get("entity_count", 0),
                "exhibit_mappings": metadata.get("exhibit_mappings", {}),
                "key_achievements": metadata.get("key_achievements", {})
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# SubArgument Management Endpoints
# ============================================

from ..services.snippet_recommender import (
    recommend_snippets_for_subargument,
    create_subargument,
    get_assigned_snippet_ids,
    infer_relationship
)


class SnippetRecommendRequest(BaseModel):
    """Snippet 推荐请求"""
    argument_id: str
    title: str
    description: Optional[str] = None
    exclude_snippet_ids: List[str] = []


class RecommendedSnippet(BaseModel):
    """推荐的 Snippet"""
    snippet_id: str
    text: str
    exhibit_id: str
    page: int
    relevance_score: float
    reason: str


class SnippetRecommendResponse(BaseModel):
    """Snippet 推荐响应"""
    success: bool
    recommended_snippets: List[RecommendedSnippet]
    total_available: int


class CreateSubArgumentRequest(BaseModel):
    """创建 SubArgument 请求"""
    argument_id: str
    title: str
    purpose: str = ""
    relationship: str = ""
    snippet_ids: List[str] = []


class SubArgumentResponse(BaseModel):
    """SubArgument 响应"""
    id: str
    argument_id: str
    title: str
    purpose: str
    relationship: str
    snippet_ids: List[str]
    is_ai_generated: bool
    status: str
    created_at: str


@router.post("/{project_id}/recommend-snippets", response_model=SnippetRecommendResponse)
async def recommend_snippets(
    project_id: str,
    request: SnippetRecommendRequest
):
    """
    为新 SubArgument 推荐相关 Snippets

    使用 LLM 进行语义相关性排序，推荐最相关的 snippets。

    Args:
        project_id: 项目 ID
        request: 包含 argument_id, title, description 等信息

    Returns:
        推荐的 snippets 列表，包含 relevance_score 和 reason
    """
    try:
        # 获取已分配的 snippet IDs
        assigned_ids = get_assigned_snippet_ids(project_id)

        # 合并排除列表
        exclude_ids = list(set(request.exclude_snippet_ids) | assigned_ids)

        # 调用推荐服务
        recommended = await recommend_snippets_for_subargument(
            project_id=project_id,
            argument_id=request.argument_id,
            title=request.title,
            description=request.description,
            exclude_snippet_ids=exclude_ids
        )

        return SnippetRecommendResponse(
            success=True,
            recommended_snippets=[
                RecommendedSnippet(
                    snippet_id=s.get("snippet_id", ""),
                    text=s.get("text", ""),
                    exhibit_id=s.get("exhibit_id", ""),
                    page=s.get("page", 0),
                    relevance_score=s.get("relevance_score", 0.5),
                    reason=s.get("reason", "")
                )
                for s in recommended
            ],
            total_available=len(recommended)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/subarguments")
async def create_new_subargument(
    project_id: str,
    request: CreateSubArgumentRequest
):
    """
    创建新的 SubArgument

    将新的 SubArgument 添加到 legal_arguments.json，
    并更新父 Argument 的 sub_argument_ids。

    Args:
        project_id: 项目 ID
        request: 包含 argument_id, title, purpose, relationship, snippet_ids

    Returns:
        新创建的 SubArgument 对象
    """
    try:
        new_subarg = create_subargument(
            project_id=project_id,
            argument_id=request.argument_id,
            title=request.title,
            purpose=request.purpose,
            relationship=request.relationship,
            snippet_ids=request.snippet_ids
        )

        return {
            "success": True,
            "subargument": new_subarg
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class InferRelationshipRequest(BaseModel):
    """推断 Relationship 请求"""
    argument_id: str
    subargument_title: str


class UpdateSubArgumentRequest(BaseModel):
    """更新 SubArgument 请求"""
    title: Optional[str] = None
    purpose: Optional[str] = None
    relationship: Optional[str] = None
    snippet_ids: Optional[List[str]] = None
    pending_snippet_ids: Optional[List[str]] = None
    needs_snippet_confirmation: Optional[bool] = None
    status: Optional[str] = None


@router.put("/{project_id}/subarguments/{subargument_id}")
async def update_subargument(
    project_id: str,
    subargument_id: str,
    request: UpdateSubArgumentRequest
):
    """
    更新 SubArgument

    可更新字段:
    - title: 标题
    - purpose: 目的描述
    - relationship: 与父论点的关系
    - snippet_ids: 已确认的 snippet IDs
    - pending_snippet_ids: 待确认的 snippet IDs
    - needs_snippet_confirmation: 是否需要确认 snippets
    - status: 状态 (draft/verified)
    """
    from ..services.snippet_recommender import load_legal_arguments, save_legal_arguments

    legal_args = load_legal_arguments(project_id)
    sub_arguments = legal_args.get("sub_arguments", [])

    found = False
    for sub_arg in sub_arguments:
        if sub_arg.get("id") == subargument_id:
            if request.title is not None:
                sub_arg["title"] = request.title
            if request.purpose is not None:
                sub_arg["purpose"] = request.purpose
            if request.relationship is not None:
                sub_arg["relationship"] = request.relationship
            if request.snippet_ids is not None:
                sub_arg["snippet_ids"] = request.snippet_ids
            if request.pending_snippet_ids is not None:
                sub_arg["pending_snippet_ids"] = request.pending_snippet_ids
            if request.needs_snippet_confirmation is not None:
                sub_arg["needs_snippet_confirmation"] = request.needs_snippet_confirmation
            if request.status is not None:
                sub_arg["status"] = request.status
            sub_arg["updated_at"] = datetime.now().isoformat()
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"SubArgument not found: {subargument_id}")

    save_legal_arguments(project_id, legal_args)

    return {
        "success": True,
        "subargument_id": subargument_id,
        "message": "SubArgument updated"
    }


@router.delete("/{project_id}/subarguments/{subargument_id}")
async def delete_subargument(
    project_id: str,
    subargument_id: str
):
    """
    删除 SubArgument

    同时从父 Argument 的 sub_argument_ids 中移除引用
    """
    print(f"[DELETE SubArgument] Received request: project_id={project_id}, subargument_id={subargument_id}")

    from ..services.snippet_recommender import load_legal_arguments, save_legal_arguments

    legal_args = load_legal_arguments(project_id)
    sub_arguments = legal_args.get("sub_arguments", [])
    arguments = legal_args.get("arguments", [])

    print(f"[DELETE SubArgument] Before: {len(sub_arguments)} sub_arguments")

    # Find and remove the SubArgument
    original_count = len(sub_arguments)
    sub_arguments = [sa for sa in sub_arguments if sa.get("id") != subargument_id]

    if len(sub_arguments) == original_count:
        print(f"[DELETE SubArgument] SubArgument not found: {subargument_id}")
        raise HTTPException(status_code=404, detail=f"SubArgument not found: {subargument_id}")

    legal_args["sub_arguments"] = sub_arguments

    # Remove reference from parent Argument's sub_argument_ids
    for arg in arguments:
        if "sub_argument_ids" in arg and subargument_id in arg["sub_argument_ids"]:
            arg["sub_argument_ids"].remove(subargument_id)

    save_legal_arguments(project_id, legal_args)
    print(f"[DELETE SubArgument] After: {len(sub_arguments)} sub_arguments, saved to file")

    return {
        "success": True,
        "subargument_id": subargument_id,
        "message": "SubArgument deleted"
    }


@router.post("/{project_id}/infer-relationship")
async def infer_subargument_relationship(
    project_id: str,
    request: InferRelationshipRequest
):
    """
    根据子论点标题推断与父论点的关系

    使用 LLM 分析子论点标题与父论点的语义关系，
    返回最合适的 relationship 标签。

    Args:
        project_id: 项目 ID
        request: 包含 argument_id 和 subargument_title

    Returns:
        推断出的 relationship 字符串
    """
    try:
        relationship = await infer_relationship(
            project_id=project_id,
            argument_id=request.argument_id,
            subargument_title=request.subargument_title
        )

        return {
            "success": True,
            "relationship": relationship
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
