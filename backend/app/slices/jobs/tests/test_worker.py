import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app import worker
from app.slices.jobs import api as jobs_api


@pytest.fixture(autouse=True)
def isolated_handlers():
    """Each test owns the registry; handlers are module-global otherwise."""
    original = dict(worker.HANDLERS)
    worker.HANDLERS.clear()
    yield
    worker.HANDLERS.clear()
    worker.HANDLERS.update(original)


async def test_run_one_reports_empty_queue(session):
    assert await worker.run_one(session, worker_id="w1") is False


async def test_successful_handler_marks_the_job_succeeded(session):
    seen: list[dict] = []

    @worker.register("test.ok")
    async def _handle(_session, job):
        seen.append(job.payload)

    await jobs_api.enqueue(session, kind="test.ok", payload={"n": 7})
    await session.flush()

    assert await worker.run_one(session, worker_id="w1") is True
    assert seen == [{"n": 7}]

    status = await session.execute(text("SELECT status FROM jobs WHERE kind = 'test.ok'"))
    assert status.scalar_one() == "succeeded"


async def test_unknown_kind_fails_instead_of_looping_forever(session):
    """With an empty registry the worker claims any kind, so a job whose
    handler was removed at deploy time still gets claimed. It must fail with a
    diagnosable message rather than be retried forever."""
    assert worker.HANDLERS == {}

    await jobs_api.enqueue(session, kind="test.orphaned", payload={})
    await session.flush()

    assert await worker.run_one(session, worker_id="w1") is True

    row = await session.execute(
        text("SELECT status, error FROM jobs WHERE kind = 'test.orphaned'")
    )
    status, error = row.one()
    assert status in {"queued", "failed"}
    assert "no handler" in error and "test.orphaned" in error


# The failure path calls session.rollback(), which under the shared-transaction
# `session` fixture would also discard the enqueue. These two use real
# committed sessions, matching how the worker actually runs: one fresh session
# per iteration.


async def test_raising_handler_requeues_with_backoff(db_engine: AsyncEngine):
    kind = f"boom.{uuid.uuid4().hex}"

    @worker.register(kind)
    async def _handle(_session, _job):
        raise RuntimeError("handler exploded")

    async with AsyncSession(db_engine, expire_on_commit=False) as setup:
        await jobs_api.enqueue(setup, kind=kind, payload={}, max_attempts=2)
        await setup.commit()

    async with AsyncSession(db_engine, expire_on_commit=False) as run:
        assert await worker.run_one(run, worker_id="w1") is True

    async with AsyncSession(db_engine) as check:
        row = await check.execute(
            text("SELECT status, error, attempts FROM jobs WHERE kind = :k"), {"k": kind}
        )
        status, error, attempts = row.one()

    assert status == "queued"
    assert attempts == 1
    assert "handler exploded" in error


async def test_a_permanently_failing_job_exhausts_its_attempts(db_engine: AsyncEngine):
    """Regression guard: the claim must be committed before the handler runs.

    When it was not, the failure path's rollback also undid the attempt
    increment, so `attempts` never rose and the job retried forever.
    """
    kind = f"always-fails.{uuid.uuid4().hex}"

    @worker.register(kind)
    async def _handle(_session, _job):
        raise RuntimeError("nope")

    async with AsyncSession(db_engine, expire_on_commit=False) as setup:
        await jobs_api.enqueue(setup, kind=kind, payload={}, max_attempts=1)
        await setup.commit()

    async with AsyncSession(db_engine, expire_on_commit=False) as run:
        await worker.run_one(run, worker_id="w1")

    async with AsyncSession(db_engine) as check:
        row = await check.execute(
            text("SELECT status, attempts FROM jobs WHERE kind = :k"), {"k": kind}
        )
        status, attempts = row.one()

    assert attempts == 1
    assert status == "failed"


async def test_handler_writes_are_rolled_back_when_it_fails(db_engine: AsyncEngine):
    """A failed job must not leave half-written rows behind, but the failure
    record itself must survive."""
    kind = f"partial.{uuid.uuid4().hex}"
    marker = f"ghost-{uuid.uuid4().hex}"

    @worker.register(kind)
    async def _handle(inner_session, _job):
        await inner_session.execute(
            text("INSERT INTO organizations (name) VALUES (:name)"), {"name": marker}
        )
        raise RuntimeError("failed after writing")

    async with AsyncSession(db_engine, expire_on_commit=False) as setup:
        await jobs_api.enqueue(setup, kind=kind, payload={})
        await setup.commit()

    async with AsyncSession(db_engine, expire_on_commit=False) as run:
        await worker.run_one(run, worker_id="w1")

    async with AsyncSession(db_engine) as check:
        leaked = await check.execute(
            text("SELECT count(*) FROM organizations WHERE name = :name"), {"name": marker}
        )
        recorded = await check.execute(
            text("SELECT error FROM jobs WHERE kind = :k"), {"k": kind}
        )

    assert leaked.scalar_one() == 0, "handler write survived a failed job"
    assert "failed after writing" in recorded.scalar_one()
