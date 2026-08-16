import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.workspace import WorkspaceMiddleware
from app.routers.arguments import router as arguments_router
from app.routers.documents import router as documents_router
from app.routers.extraction import router as extraction_router
from app.routers.projects import router as projects_router
from app.routers.writing import router as writing_router

# Application-wide logging. Without this, every `logger.debug/info` in the
# routers and services is silently dropped (root logger defaults to WARNING).
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
# httpx logs every request at INFO; too noisy for our purposes.
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("EB-1A Petition API starting (provider=%s)", settings.llm_provider)
    yield
    logger.info("EB-1A Petition API shutting down")


app = FastAPI(
    title="EB-1A Petition API",
    description="EB-1A / NIW Immigration Petition Letter Authoring System",
    version="2.0.0",
    lifespan=lifespan
)

# CORS: explicit allow-list from settings (default: local Vite dev server).
# No credentials -- the app does not use cookies; a bearer token header is
# used instead (see workspace middleware), which works without credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Workspace scoping (bearer token -> ContextVar). Added AFTER CORSMiddleware so
# that CORS wraps it (Starlette applies middleware in reverse order of add).
app.add_middleware(WorkspaceMiddleware)

# Include routers (new frontend only)
app.include_router(projects_router)
app.include_router(writing_router)
app.include_router(arguments_router)
app.include_router(extraction_router)
app.include_router(documents_router)


# Global exception handler for unified error responses.
# Never echo `str(exc)` to the client: it leaks absolute filesystem paths,
# upstream API error bodies (possibly containing key fragments), etc.
# The full traceback goes to the server log, tagged with an error_id that
# is also returned to the client so support can correlate the two.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_id = uuid.uuid4().hex[:12]
    logger.exception(
        "Unhandled error %s on %s %s", error_id, request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "error_id": error_id,
            "detail": None,
        }
    )


@app.get("/")
def root():
    return {
        "name": "EB-1A Petition API",
        "version": "2.0.0",
        "routers": [
            "projects", "documents", "extraction",
            "arguments", "writing-v3"
        ]
    }


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
