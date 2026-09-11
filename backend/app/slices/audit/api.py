"""Published interface for the audit slice."""

import uuid
from dataclasses import dataclass
from datetime import datetime
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


@dataclass(frozen=True)
class AuditEntry:
    id: uuid.UUID
    action: str
    actor_id: uuid.UUID | None
    target_type: str | None
    target_id: str | None
    metadata: dict[str, Any]
    created_at: datetime


async def list_recent(
    session: AsyncSession, *, workspace_id: uuid.UUID, limit: int = 50
) -> list[AuditEntry]:
    rows = await repository.list_recent(session, workspace_id=workspace_id, limit=limit)
    return [
        AuditEntry(
            id=row.id,
            action=row.action,
            actor_id=row.actor_id,
            target_type=row.target_type,
            target_id=row.target_id,
            metadata=dict(row.meta),
            created_at=row.created_at,
        )
        for row in rows
    ]


__all__ = ["actions", "record", "AuditEntry", "list_recent"]
