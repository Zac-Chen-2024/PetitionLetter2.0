"""
Shared pytest fixtures.

`tmp_data_dir` redirects the storage layer to a throw-away directory so that
tests never touch backend/data/.

NOTE (until M4 path consolidation lands): several live modules still carry
their own module-level PROJECTS_DIR constant, so the fixture patches each of
them. After M4 only `storage` needs patching -- shrink this list then.
"""
import json

import pytest

# Modules that (pre-M4) define their own DATA_DIR / PROJECTS_DIR constants.
_PATH_MODULES = [
    "app.services.storage",
    "app.services.snippet_registry",
    "app.services.snippet_recommender",
    "app.services.petition_writer_v3",
    "app.services.unified_extractor",
]


@pytest.fixture
def tmp_data_dir(tmp_path, monkeypatch):
    import importlib

    data = tmp_path / "data"
    (data / "projects").mkdir(parents=True)
    for name in _PATH_MODULES:
        mod = importlib.import_module(name)
        if hasattr(mod, "DATA_DIR"):
            monkeypatch.setattr(mod, "DATA_DIR", data)
        if hasattr(mod, "PROJECTS_DIR"):
            monkeypatch.setattr(mod, "PROJECTS_DIR", data / "projects")
    return data


@pytest.fixture
def client(tmp_data_dir):
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def victim_project(tmp_data_dir):
    """A minimal project on disk; returns its id."""
    pdir = tmp_data_dir / "projects" / "victim"
    pdir.mkdir()
    (pdir / "meta.json").write_text(
        json.dumps({"id": "victim", "name": "v", "createdAt": "2026-01-01T00:00:00"}),
        encoding="utf-8",
    )
    return "victim"
