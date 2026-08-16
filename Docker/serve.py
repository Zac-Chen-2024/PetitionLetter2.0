"""
Production entrypoint — imports original FastAPI app, adds SPA static serving.
Original main.py is NOT modified; dev workflow (`python run.py`) is unaffected.

Works in both Docker (/app/data) and portable (../data relative to script) modes.
"""

import logging
from pathlib import Path

from app.main import app
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data locations
# Local dev recorded absolute (Windows) source_path values in metadata.json.
# Since M4 the backend resolves them at read time via
# storage.resolve_source_path(), searching settings.source_data_dir by the
# person-folder name -- so nothing is patched on disk here anymore. We only
# make sure the two roots point at the right place for Docker / portable mode.
# ---------------------------------------------------------------------------
from app.core.config import settings  # noqa: E402

_docker_data = Path("/app/data")
_portable_data = Path(__file__).resolve().parent.parent / "data"
if not settings.source_data_dir:
    settings.source_data_dir = str(_docker_data if _docker_data.is_dir() else _portable_data)
if not settings.data_dir:
    settings.data_dir = str(Path(__file__).resolve().parent / "data")

# ---------------------------------------------------------------------------
# SPA static file serving
# ---------------------------------------------------------------------------
frontend_dist = Path(__file__).resolve().parent / "frontend-dist"

if frontend_dist.is_dir():
    # Remove main.py's GET / (API info JSON) so the SPA serves at /
    app.router.routes = [
        r for r in app.router.routes
        if not (hasattr(r, "path") and r.path == "/"
                and hasattr(r, "methods") and "GET" in (r.methods or set()))
    ]

    # Serve /assets (hashed JS/CSS bundles) directly
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    # Catch-all: serve static files or fall back to index.html (SPA)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8008)
