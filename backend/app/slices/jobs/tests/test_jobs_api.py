import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.slices.jobs import api as jobs_api

KIND = "test.work"


async def test_enqueue_creates_a_queued_job(session):
    job_id = await jobs_api.enqueue(session, kind=KIND, payload={"n": 1})
    await session.flush()

    row = await session.execute(
        text("SELECT kind, status, attempts, payload FROM jobs WHERE id = :id"),
        {"id": job_id},
    )
    kind, status, attempts, payload = row.one()
    assert (kind, status, attempts, payload) == (KIND, "queued", 0, {"n": 1})


async def test_claim_marks_running_and_increments_attempts(session):
    await jobs_api.enqueue(session, kind=KIND, payload={"n": 1})
    await session.flush()

    claimed = await jobs_api.claim(session, worker_id="w1", kinds=[KIND])

    assert claimed is not None
    assert claimed.kind == KIND
    assert claimed.attempts == 1

    row = await session.execute(
        text("SELECT status, locked_by FROM jobs WHERE id = :id"), {"id": claimed.id}
    )
    assert row.one() == ("running", "w1")


async def test_claim_returns_none_when_nothing_is_queued(session):
    assert await jobs_api.claim(session, worker_id="w1", kinds=[KIND]) is None


async def test_claim_ignores_other_kinds(session):
    await jobs_api.enqueue(session, kind="other.kind", payload={})
    await session.flush()

    assert await jobs_api.claim(session, worker_id="w1", kinds=[KIND]) is None


async def test_claim_respects_run_after(session):
    await jobs_api.enqueue(
        session,
        kind=KIND,
        payload={},
        run_after=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    await session.flush()

    assert await jobs_api.claim(session, worker_id="w1", kinds=[KIND]) is None


async def test_complete_marks_the_job_succeeded(session):
    await jobs_api.enqueue(session, kind=KIND, payload={})
    await session.flush()
    claimed = await jobs_api.claim(session, worker_id="w1", kinds=[KIND])

    await jobs_api.complete(session, job_id=claimed.id)

    row = await session.execute(
        text("SELECT status FROM jobs WHERE id = :id"), {"id": claimed.id}
    )
    assert row.scalar_one() == "succeeded"


async def test_failure_requeues_until_attempts_are_exhausted(session):
    await jobs_api.enqueue(session, kind=KIND, payload={}, max_attempts=2)
    await session.flush()

    first = await jobs_api.claim(session, worker_id="w1", kinds=[KIND])
    await jobs_api.fail(session, job_id=first.id, error="boom")

    requeued = await session.execute(
        text("SELECT status, error FROM jobs WHERE id = :id"), {"id": first.id}
    )
    assert requeued.one() == ("queued", "boom")

    # Backoff pushes run_after into the future, so it is not immediately
    # re-claimable.
    assert await jobs_api.claim(session, worker_id="w1", kinds=[KIND]) is None

    await session.execute(
        text("UPDATE jobs SET run_after = now() - interval '1 second' WHERE id = :id"),
        {"id": first.id},
    )
    second = await jobs_api.claim(session, worker_id="w1", kinds=[KIND])
    assert second is not None and second.attempts == 2

    await jobs_api.fail(session, job_id=second.id, error="boom again")
    exhausted = await session.execute(
        text("SELECT status FROM jobs WHERE id = :id"), {"id": first.id}
    )
    assert exhausted.scalar_one() == "failed"


async def test_stale_lease_is_reclaimed(session):
    """A worker that dies mid-job must not strand it in `running` forever."""
    await jobs_api.enqueue(session, kind=KIND, payload={})
    await session.flush()
    claimed = await jobs_api.claim(session, worker_id="dead", kinds=[KIND])

    await session.execute(
        text("UPDATE jobs SET locked_at = now() - interval '2 hours' WHERE id = :id"),
        {"id": claimed.id},
    )

    reclaimed = await jobs_api.reclaim_expired(session, lease_seconds=60)
    assert reclaimed == 1

    row = await session.execute(
        text("SELECT status, locked_by FROM jobs WHERE id = :id"), {"id": claimed.id}
    )
    assert row.one() == ("queued", None)


async def test_two_workers_never_claim_the_same_job(db_engine: AsyncEngine):
    """The SKIP LOCKED guarantee, exercised against real concurrent sessions."""
    kind = f"race.{uuid.uuid4().hex}"

    async with AsyncSession(db_engine, expire_on_commit=False) as setup:
        for index in range(4):
            await jobs_api.enqueue(setup, kind=kind, payload={"n": index})
        await setup.commit()

    async def worker(name: str) -> list[uuid.UUID]:
        claimed: list[uuid.UUID] = []
        async with AsyncSession(db_engine, expire_on_commit=False) as session:
            while True:
                job = await jobs_api.claim(session, worker_id=name, kinds=[kind])
                if job is None:
                    break
                claimed.append(job.id)
                await jobs_api.complete(session, job_id=job.id)
                await session.commit()
        return claimed

    first, second = await asyncio.gather(worker("w1"), worker("w2"))

    assert sorted(first + second) == sorted(set(first + second)), "a job was claimed twice"
    assert len(first + second) == 4
