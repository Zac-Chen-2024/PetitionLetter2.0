from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.db.database import engine, Base, SessionLocal
from app.routers.pipeline import router as pipeline_router
from app.routers.projects import router as projects_router
from app.routers.highlight import router as highlight_router
from app.models.document import Document, OCRStatus
from app.services import storage


def recover_interrupted_ocr():
    """后端启动时恢复中断的 OCR 任务

    检查数据库中处于 PROCESSING 或 QUEUED 状态的文档：
    - 如果有已完成的页，标记为 PARTIAL
    - 如果没有已完成的页，标记为 PENDING
    这样用户可以手动恢复这些任务
    """
    db = SessionLocal()
    try:
        # 查找所有中断的任务（PROCESSING 或 QUEUED 状态）
        interrupted_docs = db.query(Document).filter(
            Document.ocr_status.in_([OCRStatus.PROCESSING.value, OCRStatus.QUEUED.value])
        ).all()

        if not interrupted_docs:
            print("[Startup] No interrupted OCR tasks found")
            return

        recovered_count = 0
        for doc in interrupted_docs:
            # 检查是否有已完成的页
            completed_pages = storage.get_completed_pages(doc.project_id, doc.id)

            if completed_pages:
                # 有已完成的页 -> PARTIAL
                doc.ocr_status = OCRStatus.PARTIAL.value
                doc.ocr_completed_pages = len(completed_pages)
                doc.ocr_error = f"Interrupted at page {max(completed_pages) + 1}. Can be resumed."
                print(f"[Startup] Recovered {doc.file_name}: PARTIAL ({len(completed_pages)} pages completed)")
            else:
                # 没有已完成的页 -> PENDING
                doc.ocr_status = OCRStatus.PENDING.value
                doc.ocr_error = "Interrupted before completing any page. Can be restarted."
                print(f"[Startup] Recovered {doc.file_name}: PENDING (no pages completed)")

            recovered_count += 1

        db.commit()
        print(f"[Startup] Recovered {recovered_count} interrupted OCR tasks")

    except Exception as e:
        print(f"[Startup] Error recovering OCR tasks: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    print("[Startup] Document Pipeline API starting...")
    recover_interrupted_ocr()
    print("[Startup] Ready to serve requests")

    yield

    # 关闭时执行
    print("[Shutdown] Document Pipeline API shutting down...")


# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Document Pipeline API",
    description="4-Stage Document Processing Pipeline: OCR -> Analysis -> Relationship -> Writing",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(pipeline_router)
app.include_router(projects_router)
app.include_router(highlight_router)


@app.get("/")
def root():
    return {
        "name": "Document Pipeline API",
        "version": "1.0.0",
        "stages": [
            "Stage 1: OCR (Baidu/GPT-4o)",
            "Stage 2: LLM1 Analysis (Entities, Tags, Quotes)",
            "Stage 3: LLM2 Relationship (Entity Relations, Evidence Chains)",
            "Stage 4: LLM3 Writing (Paragraphs with Citations)"
        ]
    }
