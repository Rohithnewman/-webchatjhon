import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError
from app.core.rate_limit import rate_limit
from app.core.security import TokenError, create_widget_token, decode_token
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.audit import api as audit_api
from app.slices.authz import api as authz_api
from app.slices.chatbots import api as chatbots_api
from app.slices.conversations import engine, repository
from app.slices.conversations.models import Conversation, ConversationMessage
from app.slices.conversations.schemas import (
    AgentMessage,
    ConversationStart,
    VisitorMessage,
)
from app.slices.conversations.services import build_services

widget_router = APIRouter(prefix="/api/v1/widget", tags=["widget"])
router = APIRouter(prefix="/api/v1/conversations", tags=["conversations"])

read_context = authz_api.require_permission(permissions.FEATURES_READ)
write_context = authz_api.require_permission(permissions.FEATURES_USE)


def _message_data(message: ConversationMessage) -> dict[str, Any]:
    return {
        "id": str(message.id),
        "ordinal": message.ordinal,
        "role": message.role,
        "content": message.content,
        "node_id": message.node_id,
        "created_at": message.created_at.isoformat(),
    }


def _conversation_data(conversation: Conversation) -> dict[str, Any]:
    return {
        "id": str(conversation.id),
        "chatbot_id": str(conversation.chatbot_id),
        "status": conversation.status,
        "visitor_label": conversation.visitor_label,
        "flow_version": conversation.flow_version,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
    }


async def _persist_turn(
    session: AsyncSession,
    conversation: Conversation,
    result: engine.StepResult,
) -> list[ConversationMessage]:
    stored = [
        await repository.append_message(
            session,
            conversation=conversation,
            role=item["role"],
            content=item["content"],
            node_id=item.get("node_id"),
        )
        for item in result.messages
    ]
    repository.apply_engine_state(
        conversation,
        status=result.status,
        current_node_id=result.current_node_id,
        variables=result.variables,
    )
    await session.flush()
    return stored


async def _load_definition(
    session: AsyncSession, conversation: Conversation
) -> dict[str, Any]:
    flow = await chatbots_api.get_current_flow(
        session,
        workspace_id=conversation.workspace_id,
        chatbot_id=conversation.chatbot_id,
    )
    if flow is None:
        raise AppError(
            code="NOT_FOUND", message="This chatbot no longer exists", status_code=404
        )
    return flow.definition


def _recent_history(
    messages: list[ConversationMessage], limit: int = 10
) -> list[dict[str, str]]:
    turns = [
        {
            "role": "assistant" if message.role in ("bot", "agent") else "user",
            "content": message.content,
        }
        for message in messages
        if message.role in ("visitor", "bot", "agent")
    ]
    return turns[-limit:]


# --------------------------------------------------------------------------
# Public widget endpoints — authenticated by the conversation-scoped token.
# --------------------------------------------------------------------------


async def widget_conversation(
    conversation_id: uuid.UUID,
    authorization: str = Header(default=""),
    session: AsyncSession = Depends(get_session),
) -> Conversation:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise AppError(code="UNAUTHORIZED", message="Missing widget token", status_code=401)
    try:
        claims = decode_token(token, expected_type="widget")
    except TokenError as exc:
        raise AppError(code="UNAUTHORIZED", message="Invalid widget token", status_code=401) from exc
    if claims.get("conversation_id") != str(conversation_id):
        raise AppError(
            code="FORBIDDEN",
            message="This token is for a different conversation",
            status_code=403,
        )
    conversation = await repository.select_conversation(
        session,
        workspace_id=uuid.UUID(claims["workspace_id"]),
        conversation_id=conversation_id,
    )
    if conversation is None:
        raise AppError(code="NOT_FOUND", message="Conversation not found", status_code=404)
    return conversation


@widget_router.post(
    "/conversations",
    status_code=201,
    dependencies=[Depends(rate_limit("widget_start"))],
)
async def start_conversation(
    body: ConversationStart, session: AsyncSession = Depends(get_session)
) -> JSONResponse:
    chatbot = await chatbots_api.get_published_chatbot(
        session, chatbot_id=body.chatbot_id
    )
    if chatbot is None:
        raise AppError(
            code="NOT_FOUND",
            message="Chatbot not found or not published",
            status_code=404,
        )
    flow = await chatbots_api.get_current_flow(
        session, workspace_id=chatbot.workspace_id, chatbot_id=chatbot.id
    )
    if flow is None:
        raise AppError(code="NOT_FOUND", message="Chatbot has no flow", status_code=404)

    conversation = await repository.insert_conversation(
        session,
        workspace_id=chatbot.workspace_id,
        chatbot_id=chatbot.id,
        flow_version=flow.version,
        visitor_label=f"Visitor {uuid.uuid4().hex[:4]}",
    )
    result = await engine.run(
        flow.definition,
        services=build_services(session, workspace_id=chatbot.workspace_id),
        conversation_id=str(conversation.id),
    )
    stored = await _persist_turn(session, conversation, result)
    await session.commit()

    return JSONResponse(
        status_code=201,
        content=success(
            {
                "conversation": _conversation_data(conversation),
                "chatbot_name": chatbot.name,
                "token": create_widget_token(
                    conversation_id=str(conversation.id),
                    workspace_id=str(chatbot.workspace_id),
                ),
                "messages": [_message_data(message) for message in stored],
            }
        ),
    )


@widget_router.post(
    "/conversations/{conversation_id}/messages",
    dependencies=[Depends(rate_limit("widget_message"))],
)
async def visitor_message(
    body: VisitorMessage,
    conversation: Conversation = Depends(widget_conversation),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if conversation.status == "closed":
        raise AppError(
            code="CONVERSATION_CLOSED",
            message="This conversation has ended",
            status_code=409,
        )

    visitor = await repository.append_message(
        session, conversation=conversation, role="visitor", content=body.content
    )
    new_messages = [visitor]

    if conversation.status == "active":
        history = _recent_history(
            await repository.list_messages(
                session,
                workspace_id=conversation.workspace_id,
                conversation_id=conversation.id,
            )
        )
        result = await engine.run(
            await _load_definition(session, conversation),
            services=build_services(
                session, workspace_id=conversation.workspace_id
            ),
            conversation_id=str(conversation.id),
            variables=conversation.variables,
            current_node_id=conversation.current_node_id,
            visitor_input=body.content,
            history=history,
        )
        new_messages += await _persist_turn(session, conversation, result)
    # During handoff the message just waits for the agent; the engine is done.

    await session.commit()
    return success(
        {
            "status": conversation.status,
            "messages": [_message_data(message) for message in new_messages],
        }
    )


@widget_router.get("/conversations/{conversation_id}/messages")
async def poll_messages(
    after: int = Query(default=0, ge=0),
    conversation: Conversation = Depends(widget_conversation),
    session: AsyncSession = Depends(get_session),
) -> dict:
    messages = await repository.list_messages(
        session,
        workspace_id=conversation.workspace_id,
        conversation_id=conversation.id,
        after_ordinal=after,
    )
    return success(
        {
            "status": conversation.status,
            "messages": [_message_data(message) for message in messages],
        }
    )


# --------------------------------------------------------------------------
# Dashboard endpoints — standard workspace auth.
# --------------------------------------------------------------------------


async def _require_conversation(
    session: AsyncSession, *, workspace_id: uuid.UUID, conversation_id: uuid.UUID
) -> Conversation:
    conversation = await repository.select_conversation(
        session, workspace_id=workspace_id, conversation_id=conversation_id
    )
    if conversation is None:
        raise AppError(code="NOT_FOUND", message="Conversation not found", status_code=404)
    return conversation


@router.get("")
async def list_conversations(
    chatbot_id: uuid.UUID | None = None,
    status: str | None = Query(default=None, pattern="^(active|handoff|closed)$"),
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    conversations = await repository.list_conversations(
        session, workspace_id=ctx.workspace_id, chatbot_id=chatbot_id, status=status
    )
    previews = await repository.last_messages(
        session,
        workspace_id=ctx.workspace_id,
        conversation_ids=[conversation.id for conversation in conversations],
    )
    return success(
        [
            {
                **_conversation_data(conversation),
                "last_message": (
                    _message_data(previews[conversation.id])
                    if conversation.id in previews
                    else None
                ),
            }
            for conversation in conversations
        ]
    )


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    conversation = await _require_conversation(
        session, workspace_id=ctx.workspace_id, conversation_id=conversation_id
    )
    messages = await repository.list_messages(
        session, workspace_id=ctx.workspace_id, conversation_id=conversation.id
    )
    return success(
        {
            **_conversation_data(conversation),
            "messages": [_message_data(message) for message in messages],
        }
    )


@router.post("/{conversation_id}/messages")
async def agent_reply(
    conversation_id: uuid.UUID,
    body: AgentMessage,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    conversation = await _require_conversation(
        session, workspace_id=ctx.workspace_id, conversation_id=conversation_id
    )
    if conversation.status != "handoff":
        raise AppError(
            code="NOT_IN_HANDOFF",
            message="Agents can only reply after the flow hands off",
            status_code=409,
        )
    message = await repository.append_message(
        session, conversation=conversation, role="agent", content=body.content
    )
    await audit_api.record(
        session,
        action=audit_api.actions.CONVERSATION_AGENT_REPLIED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="conversation",
        target_id=str(conversation.id),
    )
    await session.commit()
    return success(_message_data(message))


@router.post("/{conversation_id}/close")
async def close_conversation(
    conversation_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    conversation = await _require_conversation(
        session, workspace_id=ctx.workspace_id, conversation_id=conversation_id
    )
    if conversation.status == "closed":
        return success(_conversation_data(conversation))
    conversation.status = "closed"
    conversation.current_node_id = None
    await repository.append_message(
        session,
        conversation=conversation,
        role="system",
        content="Conversation closed by an agent.",
    )
    await audit_api.record(
        session,
        action=audit_api.actions.CONVERSATION_CLOSED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="conversation",
        target_id=str(conversation.id),
    )
    await session.commit()
    return success(_conversation_data(conversation))
