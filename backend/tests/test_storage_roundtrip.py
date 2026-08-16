"""
Save/load pairs of the storage layer. These are the safety net for M3
(atomic write replacement) and M4 (path consolidation): both are mechanical
refactors whose only real risk is a missed call site.
"""
from app.services import storage
from app.services.petition_writer_v3 import load_latest_writing_v3, save_writing_v3
from app.services.snippet_recommender import load_legal_arguments, save_legal_arguments


def test_create_and_get_project(tmp_data_dir):
    meta = storage.create_project("Alice", "NIW")
    assert meta["projectType"] == "NIW"
    assert meta["projectNumber"].startswith("NIW-")
    got = storage.get_project(meta["id"])
    assert got["name"] == "Alice"
    assert [p["id"] for p in storage.list_projects()] == [meta["id"]]


def test_update_project_meta(tmp_data_dir):
    meta = storage.create_project("Bob")
    updated = storage.update_project_meta(meta["id"], {"beneficiaryName": "Bob B."})
    assert updated["beneficiaryName"] == "Bob B."
    assert storage.get_project(meta["id"])["beneficiaryName"] == "Bob B."


def test_documents_roundtrip(tmp_data_dir):
    meta = storage.create_project("Carol")
    assert storage.get_documents(meta["id"]) == []
    storage.add_document(meta["id"], {"id": "d1", "file_name": "a.pdf"})
    storage.update_document(meta["id"], "d1", {"page_count": 3})
    docs = storage.get_documents(meta["id"])
    assert docs == [{"id": "d1", "file_name": "a.pdf", "page_count": 3}]


def test_delete_project(tmp_data_dir):
    meta = storage.create_project("Dan")
    assert storage.delete_project(meta["id"]) is True
    assert storage.get_project(meta["id"]) is None
    assert storage.delete_project(meta["id"]) is False


def test_legal_arguments_roundtrip(tmp_data_dir):
    pid = "proj-1"
    assert load_legal_arguments(pid) == {"arguments": [], "sub_arguments": []}
    data = {"arguments": [{"id": "arg-1", "standard_key": "awards", "sub_argument_ids": ["subarg-1"]}],
            "sub_arguments": [{"id": "subarg-1", "argument_id": "arg-1", "snippet_ids": ["snp_A1_x"]}]}
    save_legal_arguments(pid, data)
    assert load_legal_arguments(pid) == data


def test_writing_v3_roundtrip_latest_wins(tmp_data_dir, monkeypatch):
    pid = "proj-2"
    assert load_latest_writing_v3(pid, "awards") is None
    v1 = save_writing_v3(pid, "awards", {"paragraph_text": "first", "sentences": []})
    # version ids are second-resolution timestamps; force a later one
    from datetime import datetime, timedelta, timezone

    import app.services.petition_writer_v3 as pw

    class _Later(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.now(timezone.utc) + timedelta(seconds=5)
    monkeypatch.setattr(pw, "datetime", _Later)
    v2 = save_writing_v3(pid, "awards", {"paragraph_text": "second", "sentences": []})
    assert v2 > v1
    assert load_latest_writing_v3(pid, "awards")["paragraph_text"] == "second"
    # other sections are isolated
    assert load_latest_writing_v3(pid, "membership") is None
