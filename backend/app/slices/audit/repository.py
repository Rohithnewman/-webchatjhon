import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.audit.models import AuditLog


async def insert(
    session: AsyncSession,
    *,
    action: str,
    workspace_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
    target_type: str | None,
    target_id: str | None,
    meta: dict[str, Any],
) -> None:
    session.add(
        AuditLog(
            action=action,
            workspace_id=workspace_id,
            actor_id=actor_id,
            target_type=target_type,
            target_id=target_id,
            meta=meta,
        )
    )
