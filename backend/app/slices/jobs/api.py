"""Published interface of the jobs slice.

Other slices enqueue work through this module and never touch the table.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.jobs import repository

DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_LEASE_SECONDS = 300
_BACKOFF_BASE_SECONDS = 30


@dataclass(frozen=True)
class JobView:
    id: uuid.UUID
    kind: str
    payload: dict[str, Any]
    attempts: int
    max_attempts: int
    workspace_id: uuid.UUID | None


def backoff_seconds(attempts: int) -> int:
    """Exponential backoff, so a provider outage is not hammered on retry."""
    return _BACKOFF_BASE_SECONDS * (2 ** max(attempts - 1, 0))


async def enqueue(
    session: AsyncSession,
    *,
    kind: str,
    payload: dict[str, Any],
    workspace_id: uuid.UUID | None = None,
    run_after: datetime | None = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> uuid.UUID:
    """Queue work inside the caller's transaction.

    Deliberately does not commit: a job must not become visible to a worker
    unless the mutation that scheduled it also commits.
    """
    job = await repository.insert(
        session,
        kind=kind,
        payload=payload,
        workspace_id=workspace_id,
        run_after=run_after,
        max_attempts=max_attempts,
    )
    return job.id


async def claim(
    session: AsyncSession, *, worker_id: str, kinds: list[str] | None = None
) -> JobView | None:
    """Take the next due job, or None when the queue is empty.

    Safe to call from many workers at once — see repository._CLAIM.
    """
    row = await repository.claim_one(session, worker_id=worker_id, kinds=kinds)
    if row is None:
        return None
    return JobView(
        id=row["id"],
        kind=row["kind"],
        payload=row["payload"],
        attempts=row["attempts"],
        max_attempts=row["max_attempts"],
        workspace_id=row["workspace_id"],
    )


async def complete(session: AsyncSession, *, job_id: uuid.UUID) -> None:
    await repository.mark_succeeded(session, job_id=job_id)


async def fail(
    session: AsyncSession,
    *,
    job_id: uuid.UUID,
    error: str,
    retry_in_seconds: int | None = None,
) -> str:
    """Record a failure, requeueing with backoff while attempts remain."""
    return await repository.mark_failed_or_retry(
        session,
        job_id=job_id,
        error=error,
        backoff_seconds=retry_in_seconds if retry_in_seconds is not None else _BACKOFF_BASE_SECONDS,
    )


async def reclaim_expired(
    session: AsyncSession, *, lease_seconds: int = DEFAULT_LEASE_SECONDS
) -> int:
    """Return jobs whose worker died mid-run to the queue."""
    return await repository.reclaim_expired(session, lease_seconds=lease_seconds)
