"""Workspace-bound implementations of the engine's injected services.

The engine stays pure; this module is where the conversations slice reaches
other slices' capabilities — always through their `api.py`.
"""

import logging
import uuid
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.conversations.engine import Services
from app.slices.knowledge import api as knowledge_api
from app.slices.providers import api as providers_api
from app.slices.providers.adapters.base import ChatMessage

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_SECONDS = 10.0
WEBHOOK_TIMEOUT_SECONDS = 5.0

#: Sensible default model per provider when the node doesn't name one.
DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-5",
    "gemini": "gemini-2.0-flash",
    "groq": "llama-3.3-70b-versatile",
    "mistral": "mistral-small-latest",
    "ollama": "llama3.2",
}


def build_services(session: AsyncSession, *, workspace_id: uuid.UUID) -> Services:
    async def chat(
        *,
        provider: str,
        model: str,
        system: str,
        history: list[dict[str, str]],
        temperature: float,
    ) -> str:
        adapter = await providers_api.get_provider(
            session, workspace_id=workspace_id, provider=provider
        )
        messages: list[ChatMessage] = []
        if system:
            messages.append(ChatMessage(role="system", content=system))
        for turn in history:
            role = "assistant" if turn.get("role") == "assistant" else "user"
            messages.append(ChatMessage(role=role, content=turn.get("content", "")))
        if not any(message.role == "user" for message in messages):
            messages.append(ChatMessage(role="user", content="Hello"))
        result = await adapter.chat(
            messages,
            model=model or DEFAULT_MODELS.get(provider, ""),
            temperature=temperature,
        )
        return result.text

    async def search(*, knowledge_base_id: str, query: str, top_k: int) -> list[str]:
        found = await knowledge_api.search(
            session,
            workspace_id=workspace_id,
            knowledge_base_id=uuid.UUID(knowledge_base_id),
            query=query,
            limit=top_k,
        )
        return [item["content"] for item in found]

    async def http(*, method: str, url: str) -> tuple[int, str]:
        _require_remote_url(url)
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = await client.request(method.upper(), url)
        return response.status_code, response.text

    async def webhook(*, url: str, payload: dict[str, Any]) -> None:
        try:
            _require_remote_url(url)
            async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT_SECONDS) as client:
                await client.post(url, json=payload)
        except Exception:  # noqa: BLE001 — webhooks are fire-and-forget
            logger.warning("webhook delivery to %s failed", url, exc_info=True)

    return Services(chat=chat, search=search, http=http, webhook=webhook)


def _require_remote_url(url: str) -> None:
    """Flow-authored URLs must not reach into the platform's own network."""
    parsed = httpx.URL(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("only http(s) URLs are allowed")
    host = parsed.host.lower()
    if host in ("localhost", "127.0.0.1", "::1", "0.0.0.0", "169.254.169.254"):
        raise ValueError("requests to internal addresses are not allowed")
