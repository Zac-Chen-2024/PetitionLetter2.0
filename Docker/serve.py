"""
Production entrypoint — imports original FastAPI app, adds SPA static serving.
Original main.py is NOT modified; dev workflow (`python run.py`) is unaffected.

Works in both Docker (/app/data) and portable (../data relative to script) modes.
"""

import json
import logging
from pathlib import Path

from app.main import app
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fix source_path in project metadata
# Local dev uses absolute Windows paths (e.g. F:\...\data\Dehuan Liu).
# In Docker the PDFs live at /app/data/<PersonName>.
# In portable mode they live at <script>/../data/<PersonName>.
# Scan all projects at startup and rewrite source_path so PDF serving works.
# ---------------------------------------------------------------------------
_docker_data = Path("/app/data")
_portable_data = Path(__file__).resolve().parent.parent / "data"
DATA_ROOT = _docker_data if _docker_data.is_dir() else _portable_data

PROJECTS_DIR = Path(__file__).resolve().parent / "data" / "projects"


def _fix_source_paths():
    if not PROJECTS_DIR.is_dir() or not DATA_ROOT.is_dir():
        return
    for meta_file in PROJECTS_DIR.glob("*/metadata.json"):
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
            old_path = meta.get("source_path", "")
            if not old_path:
                continue
            # Extract the person folder name from the original path
            # e.g. "F:\...\data\Dehuan Liu" → "Dehuan Liu"
            person_name = Path(old_path).name
            new_path = str(DATA_ROOT / person_name)
            if str(Path(old_path)) != str(Path(new_path)):
                meta["source_path"] = new_path
                with open(meta_file, "w", encoding="utf-8") as f:
                    json.dump(meta, f, ensure_ascii=False, indent=2)
                logger.info("Patched source_path: %s -> %s", old_path, new_path)
        except Exception as e:
            logger.warning("Failed to patch %s: %s", meta_file, e)


_fix_source_paths()

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
