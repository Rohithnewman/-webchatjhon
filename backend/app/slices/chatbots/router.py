import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.authz import api as authz_api
from app.slices.chatbots import repository, service
from app.slices.chatbots.models import Chatbot, Flow
from app.slices.chatbots.schemas import ChatbotCreate, ChatbotUpdate, FlowDocument
from app.slices.tenancy import api as tenancy_api

router = APIRouter(prefix="/api/v1/chatbots", tags=["chatbots"])

read_context = authz_api.require_permission(permissions.FEATURES_READ)
write_context = authz_api.require_permission(permissions.FEATURES_USE)


def _chatbot_data(chatbot: Chatbot, current_version: int | None = None) -> dict:
    return {
        "id": str(chatbot.id),
        "workspace_id": str(chatbot.workspace_id),
        "name": chatbot.name,
        "description": chatbot.description,
        "status": chatbot.status,
        "current_version": current_version,
        "created_at": chatbot.created_at.isoformat(),
        "updated_at": chatbot.updated_at.isoformat(),
    }


def _flow_data(flow: Flow) -> dict:
    return {
        "id": str(flow.id),
        "workspace_id": str(flow.workspace_id),
        "chatbot_id": str(flow.chatbot_id),
        "version": flow.version,
        "definition": flow.definition,
        "is_current": flow.is_current,
        "created_by": str(flow.created_by),
        "created_at": flow.created_at.isoformat(),
    }


async def _require_chatbot(
    session: AsyncSession, *, workspace_id: uuid.UUID, chatbot_id: uuid.UUID
) -> Chatbot:
    chatbot = await repository.select_chatbot(
        session, workspace_id=workspace_id, chatbot_id=chatbot_id
    )
    if chatbot is None:
        raise AppError(code="NOT_FOUND", message="Chatbot not found", status_code=404)
    return chatbot


@router.get("")
async def list_chatbots(
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await repository.list_chatbots(session, workspace_id=ctx.workspace_id)
    return success([_chatbot_data(chatbot, version) for chatbot, version in rows])


@router.post("")
async def create_chatbot(
    body: ChatbotCreate,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    organization = await tenancy_api.get_organization_of_workspace(session, workspace_id=ctx.workspace_id)
    if organization is not None:
        sub = await tenancy_api.get_subscription(session, organization_id=organization.id)
        if sub is not None and sub.chatbot_limit is not None:
            workspace_ids = await tenancy_api.list_org_workspace_ids(session, organization_id=organization.id)
            chatbots_used = await repository.count_for_workspaces(session, workspace_ids=workspace_ids)
            if chatbots_used >= sub.chatbot_limit:
                raise AppError(
                    code="PLAN_LIMIT",
                    message=f"The {sub.plan} plan allows {sub.chatbot_limit} chatbots. Upgrade the plan to add more.",
                    status_code=403,
                )
    chatbot, flow = await service.create_chatbot(
        session,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        name=body.name,
        description=body.description,
    )
    return JSONResponse(
        status_code=201,
        content=success(_chatbot_data(chatbot, flow.version)),
    )


@router.get("/{chatbot_id}")
async def get_chatbot(
    chatbot_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    chatbot = await _require_chatbot(
        session, workspace_id=ctx.workspace_id, chatbot_id=chatbot_id
    )
    flow = await repository.select_current_flow(
        session, workspace_id=ctx.workspace_id, chatbot_id=chatbot_id
    )
    return success(_chatbot_data(chatbot, flow.version if flow else None))


@router.patch("/{chatbot_id}")
async def update_chatbot(
    chatbot_id: uuid.UUID,
    body: ChatbotUpdate,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    chatbot = await service.update_chatbot(
        session,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        chatbot_id=chatbot_id,
        changes=body.model_dump(exclude_none=True),
    )
    flow = await repository.select_current_flow(
        session, workspace_id=ctx.workspace_id, chatbot_id=chatbot_id
    )
    return success(_chatbot_data(chatbot, flow.version if flow else None))


@router.delete("/{chatbot_id}")
async def delete_chatbot(
    chatbot_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await service.delete_chatbot(
        session,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        chatbot_id=chatbot_id,
    )
    return success({"deleted": True})


@router.get("/{chatbot_id}/flow")
async def get_current_flow(
    chatbot_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _require_chatbot(
        session, workspace_id=ctx.workspace_id, chatbot_id=chatbot_id
    )
    flow = await repository.select_current_flow(
        session, workspace_id=ctx.workspace_id, chatbot_id=chatbot_id
    )
    if flow is None:
        raise AppError(code="NOT_FOUND", message="Flow not found", status_code=404)
    return success(_flow_data(flow))


@router.put("/{chatbot_id}/flow")
async def save_flow(
    chatbot_id: uuid.UUID,
    body: FlowDocument,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    flow = await service.save_flow(
        session,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        chatbot_id=chatbot_id,
        definition=body,
    )
    return success(_flow_data(flow))


@router.get("/{chatbot_id}/flow/versions")
async def list_flow_versions(
    chatbot_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _require_chatbot(
        session, workspace_id=ctx.workspace_id, chatbot_id=chatbot_id
    )
    versions = await repository.list_flow_versions(
        session, workspace_id=ctx.workspace_id, chatbot_id=chatbot_id
    )
    return success(
        [
            {
                "id": str(flow.id),
                "version": flow.version,
                "is_current": flow.is_current,
                "created_by": str(flow.created_by),
                "created_at": flow.created_at.isoformat(),
            }
            for flow in versions
        ]
    )


@router.post("/{chatbot_id}/flow/versions/{version}/restore")
async def restore_flow(
    chatbot_id: uuid.UUID,
    version: int,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    flow = await service.restore_flow(
        session,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        chatbot_id=chatbot_id,
        version=version,
    )
    return success(_flow_data(flow))
