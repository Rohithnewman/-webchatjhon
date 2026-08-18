"""Anthropic adapter, built on the official `anthropic` SDK.

Every other provider in this slice speaks the OpenAI wire format over raw
httpx, but Anthropic's API differs enough — the system prompt is a top-level
parameter rather than a message, and content arrives as typed blocks — that
using the official SDK is both more correct and less code. Per architecture
section 3.5 the SDK is imported HERE ONLY; nothing outside this module knows
Anthropic exists.
"""

from collections.abc import AsyncIterator, Sequence
from typing import Any

import anthropic

from app.slices.providers.adapters.base import (
    ChatMessage,
    ChatResult,
    ProviderError,
    UnsupportedCapability,
)

#: Sensible default when a chatbot has not pinned a model.
DEFAULT_MODEL = "claude-opus-5"

#: The Messages API requires max_tokens; the SDK does not supply a default.
DEFAULT_MAX_TOKENS = 4096

REQUEST_TIMEOUT_SECONDS = 60.0


def _split_system(messages: Sequence[ChatMessage]) -> tuple[str | None, list[dict[str, str]]]:
    """Anthropic takes the system prompt as a top-level parameter, not a
    message with `role="system"`. Passing one as a message is rejected."""
    system_parts = [m.content for m in messages if m.role == "system"]
    turns = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
    return ("\n\n".join(system_parts) or None), turns


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, *, api_key: str, base_url: str | None = None) -> None:
        self._client = anthropic.AsyncAnthropic(
            api_key=api_key,
            timeout=REQUEST_TIMEOUT_SECONDS,
            **({"base_url": base_url} if base_url else {}),
        )

    async def chat(
        self, messages: Sequence[ChatMessage], *, model: str, **options: Any
    ) -> ChatResult:
        system, turns = _split_system(messages)
        try:
            response = await self._client.messages.create(
                model=model or DEFAULT_MODEL,
                max_tokens=options.pop("max_tokens", DEFAULT_MAX_TOKENS),
                messages=turns,
                **({"system": system} if system else {}),
                **options,
            )
        except Exception as exc:
            raise _translate(exc) from exc

        # A safety classifier can decline the request: HTTP 200, no content.
        # Reading content[0] unconditionally would IndexError here.
        if response.stop_reason == "refusal":
            raise ProviderError(
                self.name, "The model declined this request", status_code=400
            )

        # `content` is a list of typed blocks (text, thinking, tool_use, ...).
        text = "".join(block.text for block in response.content if block.type == "text")
        return ChatResult(
            text=text,
            model=response.model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )

    async def stream(
        self, messages: Sequence[ChatMessage], *, model: str, **options: Any
    ) -> AsyncIterator[str]:
        system, turns = _split_system(messages)
        try:
            async with self._client.messages.stream(
                model=model or DEFAULT_MODEL,
                max_tokens=options.pop("max_tokens", DEFAULT_MAX_TOKENS),
                messages=turns,
                **({"system": system} if system else {}),
                **options,
            ) as stream:
                async for chunk in stream.text_stream:
                    yield chunk
        except Exception as exc:
            raise _translate(exc) from exc

    async def embed(self, texts: Sequence[str], *, model: str) -> list[list[float]]:
        # Anthropic publishes no embeddings endpoint. Raising a non-retryable
        # error means the ingestion job fails fast instead of backing off
        # against something that will never succeed.
        raise UnsupportedCapability(self.name, "embeddings")


def _translate(exc: Exception) -> ProviderError:
    """Map the SDK's typed exceptions onto the slice's own error type.

    Ordered most-specific first, and deliberately not a single broad catch:
    the status code is what tells the job queue whether a retry is worthwhile.
    """
    if isinstance(exc, ProviderError):
        return exc
    if isinstance(exc, anthropic.APIStatusError):
        return ProviderError("anthropic", exc.message, status_code=exc.status_code)
    if isinstance(exc, anthropic.APIConnectionError):
        return ProviderError("anthropic", f"connection failed: {exc}")
    return ProviderError("anthropic", str(exc))
