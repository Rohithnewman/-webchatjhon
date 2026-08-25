"""Background job worker.

Run with:  python -m app.worker

Polls the `jobs` table, dispatches each claimed job to its registered handler,
and records the outcome. Several workers may run concurrently — claiming uses
FOR UPDATE SKIP LOCKED, so no job is ever handed out twice.

This replaces Celery per the Phase 3 design. Because handlers are plain
callables keyed by `kind`, moving to a real broker later swaps this runner
without touching a single handler.
"""

import asyncio
import logging
import os
import signal
import socket
from collections.abc import Awaitable, Callable
from typing import Final

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.slices.jobs import api as jobs_api
from app.slices.jobs.api import JobView

logger = logging.getLogger("worker")

JobHandler = Callable[[AsyncSession, JobView], Awaitable[None]]

#: Handlers register here at import time, keyed by job kind.
HANDLERS: Final[dict[str, JobHandler]] = {}

POLL_INTERVAL_SECONDS: Final = 2.0
RECLAIM_EVERY_SECONDS: Final = 60.0


def register(kind: str) -> Callable[[JobHandler], JobHandler]:
    """Bind a handler to a job kind."""

    def decorator(handler: JobHandler) -> JobHandler:
        if kind in HANDLERS:
            raise ValueError(f"handler for {kind!r} already registered")
        HANDLERS[kind] = handler
        return handler

    return decorator


# Import handlers for registration — after `register` exists, because handler
# modules import it back. Kept here so `python -m app.worker` and tests share
# the exact same dispatch table.
from app.slices.knowledge import worker as _knowledge_worker  # noqa: E402,F401


async def run_one(session: AsyncSession, *, worker_id: str) -> bool:
    """Claim and run a single job. Returns False when the queue was empty."""
    job = await jobs_api.claim(session, worker_id=worker_id, kinds=list(HANDLERS) or None)
    if job is None:
        return False

    # Commit the claim before running anything. The claim carries the attempt
    # increment and the lock; if it stayed open, the rollback on the failure
    # path below would undo it, attempts would never rise, and a permanently
    # failing job would retry forever instead of exhausting max_attempts.
    await session.commit()

    handler = HANDLERS.get(job.kind)
    if handler is None:
        # Claimed something nobody can run. Fail it rather than loop on it
        # forever — an unknown kind is a deployment mistake, not a transient.
        await jobs_api.fail(session, job_id=job.id, error=f"no handler for kind {job.kind!r}")
        await session.commit()
        logger.error("no handler for kind %s (job %s)", job.kind, job.id)
        return True

    try:
        await handler(session, job)
        await jobs_api.complete(session, job_id=job.id)
        await session.commit()
        logger.info("job %s (%s) succeeded", job.id, job.kind)
    except Exception as exc:  # noqa: BLE001 — any handler failure is a job failure
        # The handler's own writes must not survive a failure, but the failure
        # record must — hence rollback first, then mark, then commit.
        await session.rollback()
        status = await jobs_api.fail(
            session,
            job_id=job.id,
            error=f"{type(exc).__name__}: {exc}",
            retry_in_seconds=jobs_api.backoff_seconds(job.attempts),
        )
        await session.commit()
        logger.exception("job %s (%s) -> %s", job.id, job.kind, status)

    return True


async def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    stopping = asyncio.Event()

    def request_stop() -> None:
        logger.info("shutdown requested; finishing current job")
        stopping.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, request_stop)
        except NotImplementedError:
            # Windows does not support add_signal_handler; KeyboardInterrupt
            # still unwinds the loop, which is good enough here.
            signal.signal(sig, lambda *_: request_stop())

    logger.info("worker %s started; handlers: %s", worker_id, sorted(HANDLERS) or "none")

    last_reclaim = 0.0
    while not stopping.is_set():
        try:
            async with async_session_factory() as session:
                now = loop.time()
                if now - last_reclaim > RECLAIM_EVERY_SECONDS:
                    reclaimed = await jobs_api.reclaim_expired(session)
                    await session.commit()
                    if reclaimed:
                        logger.warning("reclaimed %d stalled job(s)", reclaimed)
                    last_reclaim = now

                did_work = await run_one(session, worker_id=worker_id)

            if not did_work:
                # Nothing due; wait, but wake immediately on shutdown.
                try:
                    await asyncio.wait_for(stopping.wait(), timeout=POLL_INTERVAL_SECONDS)
                except TimeoutError:
                    pass
        except Exception:  # noqa: BLE001 — the loop must outlive any single error
            logger.exception("worker loop error; backing off")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    logger.info("worker %s stopped", worker_id)


if __name__ == "__main__":
    asyncio.run(main())
