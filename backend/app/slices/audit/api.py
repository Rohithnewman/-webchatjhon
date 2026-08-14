"""Published interface for the audit slice."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.audit import actions, repository


async def record(
    session: AsyncSession,
    *,
    action: str,
    workspace_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    await repository.insert(
        session,
        action=action,
        workspace_id=workspace_id,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        meta=metadata or {},
    )


__all__ = ["actions", "record"]
