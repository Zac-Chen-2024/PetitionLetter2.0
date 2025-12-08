"""Document Model - 存储上传的文档和 OCR/分析结果"""

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from datetime import datetime
import uuid
import enum

from app.db.database import Base


class OCRStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Document(Base):
    """文档模型"""
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), nullable=False, index=True)  # 项目ID

    # 文件信息
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=True)

    # OCR 结果
    page_count = Column(Integer, default=1)
    ocr_text = Column(Text, nullable=True)
    ocr_status = Column(String(20), default=OCRStatus.PENDING.value)
    ocr_provider = Column(String(50), nullable=True)
    ocr_error = Column(Text, nullable=True)

    # Exhibit 信息
    exhibit_number = Column(String(20), nullable=True)
    exhibit_title = Column(String(255), nullable=True)

    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    ocr_completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DocumentAnalysis(Base):
    """文档分析结果"""
    __tablename__ = "document_analyses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=False, unique=True)

    # 分析结果
    document_type = Column(String(100), nullable=True)
    document_date = Column(String(20), nullable=True)
    entities_json = Column(Text, nullable=True)
    tags_json = Column(Text, nullable=True)
    key_quotes_json = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)

    # 时间戳
    analyzed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
