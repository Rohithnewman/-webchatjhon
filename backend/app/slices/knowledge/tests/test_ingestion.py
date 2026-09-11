import uuid

import pytest

from app.slices.jobs.api import JobView
from app.slices.knowledge import api, repository
from app.slices.knowledge.worker import chunk_text, ingest_document
from app.slices.tenancy import api as tenancy_api


def test_chunk_text_windows_with_overlap():
    words = [f"w{i}" for i in range(1100)]
    chunks = chunk_text(" ".join(words), size=512, overlap=50)

    assert len(chunks) == 3
    first, second, _ = (chunk.split() for chunk in chunks)
    assert first[:2] == ["w0", "w1"]
    # The second window starts 462 words in (512 - 50 overlap).
    assert second[0] == "w462"


def test_chunk_text_empty_input_produces_no_chunks():
    assert chunk_text("   ") == []


@pytest.fixture
async def workspace_id(session):
    tenant = await tenancy_api.create_tenant(
        session, org_name=f"Org {uuid.uuid4().hex[:6]}"
    )
    return tenant.workspace_id


async def test_ingest_document_writes_chunks_and_marks_ready(
    session, workspace_id, tmp_path
):
    base = await repository.create_base(
        session, workspace_id=workspace_id, name="Docs", description=""
    )
    source = tmp_path / "guide.txt"
    source.write_text("alpha beta gamma delta epsilon", encoding="utf-8")
    document = await repository.create_document(
        session,
        workspace_id=workspace_id,
        knowledge_base_id=base.id,
        filename="guide.txt",
        content_type="text/plain",
        byte_size=source.stat().st_size,
        storage_path=str(source),
    )
    await session.flush()

    job = JobView(
        id=uuid.uuid4(),
        kind="ingest_document",
        payload={"document_id": str(document.id)},
        attempts=1,
        max_attempts=3,
        workspace_id=workspace_id,
    )
    await ingest_document(session, job)
    await session.flush()

    refreshed = await repository.get_document(
        session, workspace_id=workspace_id, document_id=document.id
    )
    assert refreshed.status == "ready"
    assert refreshed.chunk_count == 1

    rows = await repository.search_chunks(
        session,
        workspace_id=workspace_id,
        base_id=base.id,
        embedding=api.local_embedding("alpha beta"),
        limit=5,
    )
    assert len(rows) == 1
    chunk, score = rows[0]
    assert chunk.ordinal == 0
    assert chunk.content == "alpha beta gamma delta epsilon"
    assert score > 0


async def test_ingest_document_missing_row_raises(session, workspace_id):
    job = JobView(
        id=uuid.uuid4(),
        kind="ingest_document",
        payload={"document_id": str(uuid.uuid4())},
        attempts=1,
        max_attempts=3,
        workspace_id=workspace_id,
    )
    with pytest.raises(ValueError):
        await ingest_document(session, job)


async def test_search_ranks_matching_document_first_and_stays_in_base(
    session, workspace_id, tmp_path
):
    base = await repository.create_base(
        session, workspace_id=workspace_id, name="Docs", description=""
    )
    other_base = await repository.create_base(
        session, workspace_id=workspace_id, name="Other", description=""
    )

    async def ingest(target_base, name: str, content: str):
        source = tmp_path / name
        source.write_text(content, encoding="utf-8")
        document = await repository.create_document(
            session,
            workspace_id=workspace_id,
            knowledge_base_id=target_base.id,
            filename=name,
            content_type="text/plain",
            byte_size=source.stat().st_size,
            storage_path=str(source),
        )
        await session.flush()
        await ingest_document(
            session,
            JobView(
                id=uuid.uuid4(),
                kind="ingest_document",
                payload={"document_id": str(document.id)},
                attempts=1,
                max_attempts=3,
                workspace_id=workspace_id,
            ),
        )
        return document

    billing = await ingest(base, "billing.txt", "invoices billing refunds payments")
    await ingest(base, "shipping.txt", "parcels shipping delivery customs")
    await ingest(other_base, "leak.txt", "invoices billing refunds payments")

    results = await repository.search_chunks(
        session,
        workspace_id=workspace_id,
        base_id=base.id,
        embedding=api.local_embedding("billing invoices"),
        limit=5,
    )
    assert len(results) == 2
    top_chunk, top_score = results[0]
    assert top_chunk.document_id == billing.id
    assert top_score > results[1][1]
    assert all(chunk.knowledge_base_id == base.id for chunk, _ in results)


import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4]


def test_local_embedding_is_identical_in_separate_interpreters():
    """The API embeds queries and the worker embeds chunks in different
    processes. If the vectors differ per process, search is meaningless."""
    code = (
        "from app.slices.knowledge.api import local_embedding;"
        "print(local_embedding('billing invoices refunds payments'))"
    )
    outputs = set()
    for seed in ("1", "2", "random"):
        env = {**os.environ, "PYTHONHASHSEED": seed, "PYTHONPATH": str(BACKEND_ROOT)}
        outputs.add(
            subprocess.check_output(
                [sys.executable, "-c", code], env=env, cwd=BACKEND_ROOT, text=True
            ).strip()
        )
    assert len(outputs) == 1, f"embedding differs between interpreters: {outputs}"
