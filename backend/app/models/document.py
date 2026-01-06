"""Document Model - 存储上传的文档和 OCR/分析结果"""

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.db.database import Base


class OCRStatus(str, enum.Enum):
    PENDING = "pending"         # 等待处理（初始状态）
    QUEUED = "queued"          # 在队列中等待
    PROCESSING = "processing"   # 正在处理
    PAUSED = "paused"          # 用户暂停
    PARTIAL = "partial"        # 部分完成（有已保存页，但未全部完成）
    COMPLETED = "completed"    # 全部完成
    FAILED = "failed"          # 完全失败
    CANCELLED = "cancelled"    # 用户取消


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

    # OCR 进度和时间
    ocr_total_pages = Column(Integer, default=0)           # PDF 总页数
    ocr_completed_pages = Column(Integer, default=0)       # 已完成页数
    ocr_started_at = Column(DateTime, nullable=True)       # 开始处理时间
    ocr_total_duration = Column(Float, nullable=True)      # 总耗时（秒）

    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    ocr_completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Highlight 状态
    highlight_status = Column(String(20), nullable=True)  # pending/processing/completed/failed
    highlight_image_urls = Column(Text, nullable=True)    # JSON: {"1": "url1", "2": "url2"...}

    # 关联 - cascade delete 确保删除文档时自动删除关联数据
    text_blocks = relationship("TextBlock", back_populates="document", cascade="all, delete-orphan")
    analysis = relationship("DocumentAnalysis", back_populates="document", cascade="all, delete-orphan", uselist=False)
    highlights = relationship("Highlight", back_populates="document", cascade="all, delete-orphan")


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

    # 关联
    document = relationship("Document", back_populates="analysis")


class TextBlock(Base):
    """文本块模型 - 存储 OCR 识别的每个文本块及其 BBox 位置

    用于后续 Inline Provenance 功能：点击引用可跳转到 PDF 具体位置并高亮
    """
    __tablename__ = "text_blocks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=False, index=True)

    # 块标识
    block_id = Column(String(50), nullable=False)  # 格式: p{page}_b{block}, 如 p1_b0
    page_number = Column(Integer, nullable=False)

    # 文本内容
    text_content = Column(Text, nullable=True)
    block_type = Column(String(30), nullable=True)  # title/text/table/image/formula/...

    # BBox 坐标 (DeepSeek-OCR 输出的归一化坐标 0-1000)
    bbox_x1 = Column(Integer, nullable=True)
    bbox_y1 = Column(Integer, nullable=True)
    bbox_x2 = Column(Integer, nullable=True)
    bbox_y2 = Column(Integer, nullable=True)

    # OCR 置信度 (可选)
    confidence = Column(Float, nullable=True)

    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    document = relationship("Document", back_populates="text_blocks")


class HighlightStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Highlight(Base):
    """高亮模型 - 存储 AI 识别的重要信息及其位置坐标"""
    __tablename__ = "highlights"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=False, index=True)

    # 高亮信息
    text_content = Column(Text, nullable=True)       # 高亮的文本内容
    importance = Column(String(20), nullable=True)   # high/medium/low
    category = Column(String(50), nullable=True)     # company_name/date/amount/person/key_fact
    reason = Column(Text, nullable=True)             # AI 给出的重要性原因

    # 位置信息
    page_number = Column(Integer, nullable=False)
    bbox_x1 = Column(Integer, nullable=True)
    bbox_y1 = Column(Integer, nullable=True)
    bbox_x2 = Column(Integer, nullable=True)
    bbox_y2 = Column(Integer, nullable=True)

    # 来源 TextBlock 引用 (JSON 数组)
    source_block_ids = Column(Text, nullable=True)   # JSON: ["p1_b0", "p1_b1"]

    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    document = relationship("Document", back_populates="highlights")
