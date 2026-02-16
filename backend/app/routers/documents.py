"""
Documents Router - PDF 文件服务

Endpoints:
- GET /api/documents/{project_id}/exhibits - 获取项目的所有 exhibit 列表
- GET /api/documents/{project_id}/pdf/{exhibit_id} - 获取 PDF 文件
- GET /api/documents/{project_id}/exhibit/{exhibit_id} - 获取 exhibit 详情（页数、OCR 数据等）
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from typing import List, Dict, Optional
import json

router = APIRouter(prefix="/api/documents", tags=["documents"])

# 数据目录
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent  # PetitionLetter/
DATA_DIR = PROJECT_ROOT / "data"
BACKEND_DATA_DIR = Path(__file__).parent.parent.parent / "data"


def get_person_dir(project_id: str) -> Optional[Path]:
    """根据 project_id 获取人员数据目录"""
    # project_id 格式: yaruo_qu -> "Yaruo Qu"
    # 遍历 data 目录找到匹配的
    if not DATA_DIR.exists():
        return None

    for item in DATA_DIR.iterdir():
        if item.is_dir() and item.name != "projects":
            # 转换为 project_id 格式比较
            normalized = item.name.lower().replace(" ", "_")
            if normalized == project_id:
                return item
    return None


@router.get("/{project_id}/exhibits")
async def get_exhibits(project_id: str):
    """
    获取项目的所有 exhibit 列表

    Returns:
        {
            "project_id": str,
            "exhibits": [
                {
                    "id": "A1",
                    "name": "Exhibit A-1",
                    "category": "A",
                    "pdf_url": "/api/documents/{project_id}/pdf/A1",
                    "page_count": 3
                }
            ]
        }
    """
    person_dir = get_person_dir(project_id)
    if not person_dir:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    pdf_dir = person_dir / "PDF"
    if not pdf_dir.exists():
        raise HTTPException(status_code=404, detail="PDF directory not found")

    exhibits = []

    # 遍历所有类别目录 (A, B, C, D, E, F, G, H)
    for category_dir in sorted(pdf_dir.iterdir()):
        if not category_dir.is_dir() or category_dir.name.startswith("_"):
            continue

        category = category_dir.name

        # 获取该类别下的所有 PDF
        for pdf_file in sorted(category_dir.glob("*.pdf")):
            exhibit_id = pdf_file.stem  # e.g., "A1", "B2"

            # 尝试从 OCR 数据获取页数
            page_count = get_exhibit_page_count(project_id, exhibit_id)

            exhibits.append({
                "id": exhibit_id,
                "name": f"Exhibit {exhibit_id[0]}-{exhibit_id[1:]}",
                "category": category,
                "pdf_url": f"/api/documents/{project_id}/pdf/{exhibit_id}",
                "page_count": page_count,
            })

    return {
        "project_id": project_id,
        "total": len(exhibits),
        "exhibits": exhibits
    }


@router.get("/{project_id}/pdf/{exhibit_id}")
async def get_pdf(project_id: str, exhibit_id: str):
    """
    获取 PDF 文件

    Args:
        project_id: 项目 ID (e.g., "yaruo_qu")
        exhibit_id: Exhibit ID (e.g., "A1", "B2")

    Returns:
        PDF 文件
    """
    person_dir = get_person_dir(project_id)
    if not person_dir:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    # exhibit_id 格式: A1 -> PDF/A/A1.pdf
    category = exhibit_id[0].upper()
    pdf_path = person_dir / "PDF" / category / f"{exhibit_id}.pdf"

    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"PDF not found: {exhibit_id}")

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"{exhibit_id}.pdf"
    )


@router.get("/{project_id}/exhibit/{exhibit_id}")
async def get_exhibit_details(project_id: str, exhibit_id: str):
    """
    获取 exhibit 详细信息，包括 OCR 数据

    Returns:
        {
            "id": "A1",
            "name": "Exhibit A-1",
            "pdf_url": str,
            "page_count": int,
            "pages": [{page_number, text_blocks, markdown_text}]
        }
    """
    # 从 backend/data/projects/{project_id}/documents/{exhibit_id}.json 读取
    doc_path = BACKEND_DATA_DIR / "projects" / project_id / "documents" / f"{exhibit_id}.json"

    if not doc_path.exists():
        raise HTTPException(status_code=404, detail=f"Exhibit not found: {exhibit_id}")

    with open(doc_path, 'r', encoding='utf-8') as f:
        doc_data = json.load(f)

    return {
        "id": exhibit_id,
        "name": f"Exhibit {exhibit_id[0]}-{exhibit_id[1:]}",
        "pdf_url": f"/api/documents/{project_id}/pdf/{exhibit_id}",
        "page_count": len(doc_data.get("pages", [])),
        "pages": doc_data.get("pages", [])
    }


def get_exhibit_page_count(project_id: str, exhibit_id: str) -> int:
    """获取 exhibit 的页数"""
    doc_path = BACKEND_DATA_DIR / "projects" / project_id / "documents" / f"{exhibit_id}.json"

    if doc_path.exists():
        try:
            with open(doc_path, 'r', encoding='utf-8') as f:
                doc_data = json.load(f)
                return len(doc_data.get("pages", []))
        except:
            pass

    return 0


@router.get("/{project_id}/categories")
async def get_exhibit_categories(project_id: str):
    """
    获取 exhibit 分类信息

    Returns:
        {
            "A": {"name": "Resume/CV", "count": 1},
            "B": {"name": "Recommendation Letters", "count": 5},
            ...
        }
    """
    # 类别描述
    CATEGORY_NAMES = {
        "A": "Resume/CV",
        "B": "Recommendation Letters",
        "C": "Awards & Recognition",
        "D": "Original Contributions",
        "E": "Scholarly Articles",
        "F": "Membership",
        "G": "Judging",
        "H": "Exhibitions/Leading Role"
    }

    person_dir = get_person_dir(project_id)
    if not person_dir:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    pdf_dir = person_dir / "PDF"
    if not pdf_dir.exists():
        return {"categories": {}}

    categories = {}
    for category_dir in sorted(pdf_dir.iterdir()):
        if not category_dir.is_dir() or category_dir.name.startswith("_"):
            continue

        category = category_dir.name
        pdf_count = len(list(category_dir.glob("*.pdf")))

        if pdf_count > 0:
            categories[category] = {
                "name": CATEGORY_NAMES.get(category, category),
                "count": pdf_count
            }

    return {"categories": categories}
