import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.jobs.models import Job

# Claim exactly one row, skipping any another worker already holds.
#
# FOR UPDATE SKIP LOCKED is the whole guarantee: without it two workers reading
# the same "queued" row would both claim it. The subquery locks the candidate,
# the outer UPDATE flips it to running in the same statement, so there is no
# window between selecting and claiming.
_CLAIM = text(
    """
    UPDATE jobs
       SET status = 'running',
           attempts = attempts + 1,
           locked_at = now(),
           locked_by = :worker_id
     WHERE id = (
             SELECT id
               FROM jobs
              WHERE status = 'queued'
                AND run_after <= now()
                AND (:all_kinds OR kind = ANY(:kinds))
              ORDER BY run_after, created_at
                FOR UPDATE SKIP LOCKED
              LIMIT 1
           )
 RETURNING id, workspace_id, kind, payload, attempts, max_attempts
    """
)

_RECLAIM = text(
    """
    UPDATE jobs
       SET status = 'queued',
           locked_at = NULL,
           locked_by = NULL
     WHERE status = 'running'
       AND locked_at < now() - make_interval(secs => :lease_seconds)
    """
)


async def insert(
    session: AsyncSession,
    *,
    kind: str,
    payload: dict[str, Any],
    workspace_id: uuid.UUID | None,
    run_after: datetime | None,
    max_attempts: int,
) -> Job:
    job = Job(
        kind=kind,
        payload=payload,
        workspace_id=workspace_id,
        max_attempts=max_attempts,
        **({"run_after": run_after} if run_after is not None else {}),
    )
    session.add(job)
    await session.flush()
    return job


async def claim_one(
    session: AsyncSession, *, worker_id: str, kinds: list[str] | None
) -> Any | None:
    result = await session.execute(
        _CLAIM,
        {
            "worker_id": worker_id,
            "kinds": kinds or [],
            "all_kinds": kinds is None,
        },
    )
    return result.mappings().one_or_none()


async def mark_succeeded(session: AsyncSession, *, job_id: uuid.UUID) -> None:
    await session.execute(
        text(
            "UPDATE jobs SET status='succeeded', locked_at=NULL, locked_by=NULL "
            "WHERE id = :id"
        ),
        {"id": job_id},
    )


async def mark_failed_or_retry(
    session: AsyncSession, *, job_id: uuid.UUID, error: str, backoff_seconds: int
) -> str:
    """Requeue with backoff while attempts remain; otherwise give up.

    Returns the resulting status so the caller can log it without a re-read.
    """
    result = await session.execute(
        text(
            """
            UPDATE jobs
               SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
                   error = :error,
                   locked_at = NULL,
                   locked_by = NULL,
                   run_after = CASE
                       WHEN attempts >= max_attempts THEN run_after
                       ELSE now() + make_interval(secs => :backoff)
                   END
             WHERE id = :id
         RETURNING status
            """
        ),
        {"id": job_id, "error": error[:2000], "backoff": backoff_seconds},
    )
    return result.scalar_one()


async def reclaim_expired(session: AsyncSession, *, lease_seconds: int) -> int:
    result = await session.execute(_RECLAIM, {"lease_seconds": lease_seconds})
    return result.rowcount or 0
