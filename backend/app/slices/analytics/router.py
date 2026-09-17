"""Read-only workspace analytics. Composes the published APIs of the
conversations and chatbots slices; owns no tables of its own."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.authz import api as authz_api
from app.slices.chatbots import api as chatbots_api
from app.slices.conversations import api as conversations_api

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])

read_context = authz_api.require_permission(permissions.ANALYTICS_READ)


@router.get("/overview")
async def overview(
    days: int = Query(default=30, ge=1, le=365),
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    daily = await conversations_api.daily_counts(
        session, workspace_id=ctx.workspace_id, since=since
    )
    statuses = await conversations_api.status_counts(
        session, workspace_id=ctx.workspace_id, since=since
    )
    per_bot = await conversations_api.counts_by_chatbot(
        session, workspace_id=ctx.workspace_id, since=since
    )
    names = await chatbots_api.list_names(session, workspace_id=ctx.workspace_id)

    return success(
        {
            "days": days,
            "totals": {
                "conversations": sum(statuses.values()),
                "messages": sum(row["messages"] for row in daily),
                "chatbots": len(names),
                "active": statuses.get("active", 0),
                "handoff": statuses.get("handoff", 0),
                "closed": statuses.get("closed", 0),
            },
            "daily": daily,
            "by_chatbot": [
                {
                    "chatbot_id": str(chatbot_id),
                    "name": names.get(chatbot_id, "Deleted chatbot"),
                    "conversations": count,
                }
                for chatbot_id, count in per_bot
            ],
        }
    )
