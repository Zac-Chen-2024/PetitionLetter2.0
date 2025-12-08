from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import engine, Base
from app.routers.pipeline import router as pipeline_router
from app.routers.projects import router as projects_router

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Document Pipeline API",
    description="4-Stage Document Processing Pipeline: OCR -> Analysis -> Relationship -> Writing",
    version="1.0.0"
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
