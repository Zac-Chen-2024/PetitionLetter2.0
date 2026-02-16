"""
Data Router - 数据导入相关 API

Endpoints:
- GET /api/data/scan - 扫描可导入的数据
- GET /api/data/projects - 列出所有项目
- POST /api/data/import/{person_name} - 导入指定人的数据
- GET /api/data/projects/{project_id} - 获取项目详情
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Optional
from pydantic import BaseModel

from ..services.data_importer import (
    scan_data_directory,
    import_person_data,
    get_import_status,
    list_projects
)
from ..services.snippet_registry import load_registry, get_registry_stats

router = APIRouter(prefix="/api/data", tags=["data"])


class ScanResult(BaseModel):
    name: str
    path: str
    exhibit_count: int
    page_count: int


class ImportResult(BaseModel):
    success: bool
    project_id: Optional[str] = None
    exhibits_imported: Optional[int] = None
    snippets_created: Optional[int] = None
    snippets_with_bbox: Optional[int] = None
    error: Optional[str] = None


class ProjectSummary(BaseModel):
    project_id: str
    person_name: str
    visa_type: str
    created_at: str
    stats: Dict


@router.get("/scan", response_model=List[ScanResult])
async def scan_available_data():
    """
    扫描 data/ 目录，返回可导入的数据列表

    返回每个人的目录信息，包括 exhibit 数量和页面数量
    """
    results = scan_data_directory()
    return results


@router.get("/projects", response_model=List[ProjectSummary])
async def get_all_projects():
    """
    列出所有已创建的项目
    """
    projects = list_projects()
    return projects


@router.post("/import/{person_name}", response_model=ImportResult)
async def import_data(person_name: str):
    """
    导入指定人的数据

    Args:
        person_name: 人名（如 "Yaruo Qu"）

    Returns:
        导入结果，包括创建的项目 ID 和统计信息
    """
    result = import_person_data(person_name)

    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Import failed"))

    return result


@router.get("/projects/{project_id}")
async def get_project_details(project_id: str):
    """
    获取项目详情

    Args:
        project_id: 项目 ID

    Returns:
        项目元数据
    """
    status = get_import_status(project_id)

    if not status:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return status


@router.get("/projects/{project_id}/snippets")
async def get_project_snippets(project_id: str, limit: int = 100, offset: int = 0):
    """
    获取项目的 snippets

    Args:
        project_id: 项目 ID
        limit: 返回数量限制
        offset: 偏移量

    Returns:
        snippets 列表
    """
    snippets = load_registry(project_id)

    if not snippets:
        raise HTTPException(status_code=404, detail=f"No snippets found for project: {project_id}")

    # 分页
    total = len(snippets)
    paginated = snippets[offset:offset + limit]

    return {
        "project_id": project_id,
        "total": total,
        "offset": offset,
        "limit": limit,
        "snippets": paginated
    }


@router.get("/projects/{project_id}/snippets/stats")
async def get_project_snippet_stats(project_id: str):
    """
    获取项目 snippets 统计信息
    """
    stats = get_registry_stats(project_id)
    return stats
