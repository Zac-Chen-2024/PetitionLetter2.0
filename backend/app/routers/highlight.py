"""
Highlight Router - 高亮分析 API

提供文档高亮分析功能：
- 触发高亮分析
- 获取高亮结果
- 保存高亮图片
- 获取文档页面图片
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
import json
import base64
import uuid

from app.db.database import get_db, SessionLocal
from app.models.document import Document, TextBlock, Highlight, HighlightStatus, OCRStatus
from app.services import highlight_service
from app.services import storage

try:
    import fitz  # PyMuPDF
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

router = APIRouter(prefix="/api/highlight", tags=["highlight"])


# ============== 数据模型 ==============

class HighlightResponse(BaseModel):
    id: str
    text_content: Optional[str]
    category: Optional[str]
    category_cn: Optional[str]
    importance: Optional[str]
    reason: Optional[str]
    page_number: int
    bbox: Optional[Dict[str, int]]
    source_block_ids: List[str]


class DocumentHighlightResponse(BaseModel):
    document_id: str
    file_name: str
    highlight_status: Optional[str]
    total_highlights: int
    highlights: List[HighlightResponse]


class SaveHighlightImageRequest(BaseModel):
    page_number: int
    image_base64: str


# ============== 高亮分析 API ==============

@router.post("/{document_id}")
async def trigger_highlight_analysis(
    document_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    触发文档高亮分析

    流程:
    1. 调用 OpenAI GPT-4o 分析文档重要信息
    2. 将识别的文本映射到 OCR BBox 坐标
    3. 保存高亮结果到数据库
    """
    # 检查文档是否存在
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 检查 OCR 是否完成
    if doc.ocr_status != OCRStatus.COMPLETED.value:
        raise HTTPException(
            status_code=400,
            detail=f"OCR not completed. Current status: {doc.ocr_status}"
        )

    # 检查是否有 text_blocks
    block_count = db.query(TextBlock).filter(TextBlock.document_id == document_id).count()
    if block_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No text blocks found. Document may not have been processed with DeepSeek-OCR."
        )

    # 检查是否已经在处理中
    if doc.highlight_status == HighlightStatus.PROCESSING.value:
        return {
            "success": True,
            "message": "Highlight analysis already in progress",
            "document_id": document_id,
            "status": "processing"
        }

    # 启动后台任务
    background_tasks.add_task(
        run_highlight_analysis_background,
        document_id
    )

    return {
        "success": True,
        "message": "Highlight analysis started",
        "document_id": document_id,
        "status": "started"
    }


def run_highlight_analysis_background(document_id: str):
    """后台执行高亮分析"""
    import asyncio

    db = SessionLocal()
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                highlight_service.analyze_and_highlight(document_id, db)
            )
            print(f"[Highlight] Analysis completed for {document_id}: {result}")
        finally:
            loop.close()
    except Exception as e:
        print(f"[Highlight] ERROR for {document_id}: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


@router.get("/{document_id}")
async def get_document_highlights(
    document_id: str,
    page: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    获取文档的高亮结果

    参数:
    - page: 可选，过滤指定页码的高亮
    """
    # 检查文档是否存在
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 获取高亮
    highlights = highlight_service.get_highlights_for_document(document_id, db, page)

    return {
        "document_id": document_id,
        "file_name": doc.file_name,
        "highlight_status": doc.highlight_status,
        "total_highlights": len(highlights),
        "highlights": highlights
    }


@router.get("/by-page/{document_id}")
async def get_highlights_by_page(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    按页码分组获取高亮

    返回: {1: [highlights...], 2: [highlights...], ...}
    """
    # 检查文档是否存在
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    by_page = highlight_service.get_highlights_by_page(document_id, db)

    return {
        "document_id": document_id,
        "file_name": doc.file_name,
        "highlight_status": doc.highlight_status,
        "page_count": doc.page_count,
        "highlights_by_page": by_page
    }


@router.get("/status/{document_id}")
async def get_highlight_status(
    document_id: str,
    db: Session = Depends(get_db)
):
    """获取高亮分析状态"""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    highlight_count = db.query(Highlight).filter(Highlight.document_id == document_id).count()

    return {
        "document_id": document_id,
        "highlight_status": doc.highlight_status,
        "highlight_count": highlight_count,
        "ocr_status": doc.ocr_status,
        "has_text_blocks": db.query(TextBlock).filter(TextBlock.document_id == document_id).count() > 0
    }


@router.get("/progress/{project_id}")
async def get_project_highlight_progress(
    project_id: str,
    db: Session = Depends(get_db)
):
    """获取项目的高亮分析总体进度"""
    documents = db.query(Document).filter(Document.project_id == project_id).all()

    if not documents:
        return {
            "project_id": project_id,
            "total": 0,
            "pending": 0,
            "processing": 0,
            "completed": 0,
            "failed": 0,
            "not_started": 0,
            "progress_percent": 0,
            "documents": []
        }

    total = len(documents)
    not_started = sum(1 for d in documents if d.highlight_status is None)
    pending = sum(1 for d in documents if d.highlight_status == HighlightStatus.PENDING.value)
    processing = sum(1 for d in documents if d.highlight_status == HighlightStatus.PROCESSING.value)
    completed = sum(1 for d in documents if d.highlight_status == HighlightStatus.COMPLETED.value)
    failed = sum(1 for d in documents if d.highlight_status == HighlightStatus.FAILED.value)

    return {
        "project_id": project_id,
        "total": total,
        "not_started": not_started,
        "pending": pending,
        "processing": processing,
        "completed": completed,
        "failed": failed,
        "progress_percent": round(completed / total * 100, 1) if total > 0 else 0,
        "documents": [
            {
                "id": d.id,
                "file_name": d.file_name,
                "exhibit_number": d.exhibit_number,
                "ocr_status": d.ocr_status,
                "highlight_status": d.highlight_status,
                "page_count": d.page_count
            }
            for d in documents
        ]
    }


# ============== 文档页面图片 API ==============

@router.get("/page/{document_id}/{page_number}/image")
async def get_document_page_image(
    document_id: str,
    page_number: int,
    dpi: int = 150,
    db: Session = Depends(get_db)
):
    """
    获取文档指定页面的图片

    将 PDF 页面渲染为 JPEG 图片返回
    """
    if not PDF_SUPPORT:
        raise HTTPException(status_code=500, detail="PDF support not available")

    # 检查文档是否存在
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 加载原始文件
    file_bytes = storage.load_uploaded_file(doc.project_id, document_id)
    if not file_bytes:
        raise HTTPException(status_code=404, detail="File not found in storage")

    # 验证页码
    if page_number < 1 or page_number > doc.page_count:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid page number. Document has {doc.page_count} pages."
        )

    # 检查文件类型
    if doc.file_name.lower().endswith('.pdf'):
        # PDF 文件：渲染指定页面
        try:
            pdf_document = fitz.open(stream=file_bytes, filetype="pdf")
            page = pdf_document[page_number - 1]  # 0-indexed

            zoom = dpi / 72
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("jpeg", jpg_quality=85)

            pdf_document.close()

            return Response(
                content=img_bytes,
                media_type="image/jpeg",
                headers={
                    "Content-Disposition": f"inline; filename=\"{doc.file_name}_page_{page_number}.jpg\""
                }
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to render page: {str(e)}")
    else:
        # 图片文件：直接返回（只有第 1 页）
        if page_number != 1:
            raise HTTPException(status_code=400, detail="Image file only has 1 page")

        content_type = "image/jpeg"
        if doc.file_name.lower().endswith('.png'):
            content_type = "image/png"
        elif doc.file_name.lower().endswith('.gif'):
            content_type = "image/gif"

        return Response(
            content=file_bytes,
            media_type=content_type,
            headers={
                "Content-Disposition": f"inline; filename=\"{doc.file_name}\""
            }
        )


# ============== 保存高亮图片 API ==============

@router.post("/{document_id}/save")
async def save_highlighted_image(
    document_id: str,
    data: SaveHighlightImageRequest,
    db: Session = Depends(get_db)
):
    """
    保存带高亮的图片

    前端将 Canvas 导出为 base64，后端保存到存储
    """
    # 检查文档是否存在
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 解码 base64 图片
    try:
        # 移除可能的 data URL 前缀
        image_data = data.image_base64
        if "," in image_data:
            image_data = image_data.split(",")[1]

        image_bytes = base64.b64decode(image_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {str(e)}")

    # 保存到存储
    try:
        file_name = f"{document_id}_page_{data.page_number}.png"
        url = storage.save_highlight_image(doc.project_id, document_id, data.page_number, image_bytes)

        # 更新文档的 highlight_image_urls
        existing_urls = {}
        if doc.highlight_image_urls:
            try:
                existing_urls = json.loads(doc.highlight_image_urls)
            except:
                pass

        existing_urls[str(data.page_number)] = url
        doc.highlight_image_urls = json.dumps(existing_urls)
        db.commit()

        return {
            "success": True,
            "document_id": document_id,
            "page_number": data.page_number,
            "url": url
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")


@router.get("/{document_id}/saved-images")
async def get_saved_highlight_images(
    document_id: str,
    db: Session = Depends(get_db)
):
    """获取已保存的高亮图片列表"""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    image_urls = {}
    if doc.highlight_image_urls:
        try:
            image_urls = json.loads(doc.highlight_image_urls)
        except:
            pass

    return {
        "document_id": document_id,
        "image_urls": image_urls,
        "total_saved": len(image_urls)
    }


# ============== 批量操作 API ==============

@router.post("/batch/{project_id}")
async def trigger_batch_highlight(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """批量触发项目中所有已完成 OCR 文档的高亮分析"""
    # 查找所有已完成 OCR 且未进行高亮分析的文档
    documents = db.query(Document).filter(
        Document.project_id == project_id,
        Document.ocr_status == OCRStatus.COMPLETED.value,
        Document.highlight_status.is_(None)  # 未开始高亮
    ).all()

    # 过滤有 text_blocks 的文档
    eligible_docs = []
    for doc in documents:
        block_count = db.query(TextBlock).filter(TextBlock.document_id == doc.id).count()
        if block_count > 0:
            eligible_docs.append(doc)

    if not eligible_docs:
        return {
            "success": True,
            "message": "No eligible documents for highlight analysis",
            "total": 0
        }

    # 启动后台任务
    for doc in eligible_docs:
        doc.highlight_status = HighlightStatus.PENDING.value
        background_tasks.add_task(
            run_highlight_analysis_background,
            doc.id
        )

    db.commit()

    return {
        "success": True,
        "message": f"Started highlight analysis for {len(eligible_docs)} documents",
        "total": len(eligible_docs),
        "documents": [{"id": d.id, "file_name": d.file_name} for d in eligible_docs]
    }
