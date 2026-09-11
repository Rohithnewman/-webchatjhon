from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.audit import api as audit_api
from app.slices.authz import api as authz_api
from app.slices.identity import api as identity_api

router = APIRouter(prefix="/api/v1/audit-logs", tags=["audit"])

manage_context = authz_api.require_permission(permissions.WORKSPACE_MANAGE)


@router.get("")
async def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    entries = await audit_api.list_recent(session, workspace_id=ctx.workspace_id, limit=limit)
    actors = await identity_api.list_users(
        session, user_ids=[e.actor_id for e in entries if e.actor_id is not None]
    )
    return success(
        [
            {
                "id": str(entry.id),
                "action": entry.action,
                "actor_id": str(entry.actor_id) if entry.actor_id else None,
                "actor_email": actors[entry.actor_id].email if entry.actor_id in actors else None,
                "target_type": entry.target_type,
                "target_id": entry.target_id,
                "metadata": entry.metadata,
                "created_at": entry.created_at.isoformat(),
            }
            for entry in entries
        ]
    )
