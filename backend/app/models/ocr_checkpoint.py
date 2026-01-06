"""OCR Checkpoint Model - 存储 OCR 处理的检查点状态，支持断点恢复"""

from sqlalchemy import Column, String, Integer, Text, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.db.database import Base


class OCRCheckpoint(Base):
    """OCR 检查点模型 - 用于持久化 OCR 任务状态"""
    __tablename__ = "ocr_checkpoints"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("documents.id"), unique=True, index=True, nullable=False)
    project_id = Column(String(50), index=True, nullable=False)

    # 队列状态
    queue_position = Column(Integer, default=0)
    batch_id = Column(String(50), nullable=True)

    # 进度信息
    total_pages = Column(Integer, default=0)
    current_page = Column(Integer, default=0)
    completed_pages = Column(Text, default="[]")  # JSON: [1, 2, 3]

    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    paused_at = Column(DateTime, nullable=True)

    # 页级别时间数据
    # JSON: {"1": {"started_at": "...", "completed_at": "...", "duration": 25.3}, ...}
    page_timings = Column(Text, default="{}")

    # 错误信息
    last_error = Column(Text, nullable=True)
    error_count = Column(Integer, default=0)

    # 关联
    document = relationship("Document", backref="ocr_checkpoint")
