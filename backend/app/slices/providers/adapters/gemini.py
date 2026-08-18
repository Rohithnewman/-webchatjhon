"""Google Gemini adapter.

Gemini is the one provider that shares neither the OpenAI wire format nor
Anthropic's: turns use `model` rather than `assistant`, content is nested in
`parts`, the system prompt is `systemInstruction`, and the API key rides in a
query parameter. Hence its own adapter.
"""

import json
from collections.abc import AsyncIterator, Sequence
from typing import Any

import httpx

from app.slices.providers.adapters.base import ChatMessage, ChatResult, ProviderError

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
REQUEST_TIMEOUT_SECONDS = 60.0


def _to_contents(messages: Sequence[ChatMessage]) -> tuple[dict | None, list[dict]]:
    system = "\n\n".join(m.content for m in messages if m.role == "system")
    contents = [
        # Gemini names the assistant turn "model".
        {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
        for m in messages
        if m.role != "system"
    ]
    instruction = {"parts": [{"text": system}]} if system else None
    return instruction, contents


class GeminiProvider:
    name = "gemini"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._client = client

    async def _request(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        client = self._client or httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)
        try:
            response = await client.post(
                f"{self._base_url}{path}",
                json=payload,
                # The key is a query parameter, not a bearer header.
                params={"key": self._api_key},
            )
            if response.status_code >= 400:
                raise ProviderError(
                    self.name, _error_message(response), status_code=response.status_code
                )
            return response.json()
        except httpx.HTTPError as exc:
            raise ProviderError(self.name, str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()

    async def chat(
        self, messages: Sequence[ChatMessage], *, model: str, **options: Any
    ) -> ChatResult:
        instruction, contents = _to_contents(messages)
        body = await self._request(
            f"/models/{model}:generateContent",
            {
                "contents": contents,
                **({"systemInstruction": instruction} if instruction else {}),
                **({"generationConfig": options} if options else {}),
            },
        )

        candidates = body.get("candidates") or []
        if not candidates:
            # Safety filters return 200 with no candidate.
            raise ProviderError(
                self.name, "No candidate returned; the request may have been filtered", status_code=400
            )

        parts = candidates[0].get("content", {}).get("parts") or []
        usage = body.get("usageMetadata") or {}
        return ChatResult(
            text="".join(part.get("text", "") for part in parts),
            model=model,
            input_tokens=usage.get("promptTokenCount"),
            output_tokens=usage.get("candidatesTokenCount"),
        )

    async def stream(
        self, messages: Sequence[ChatMessage], *, model: str, **options: Any
    ) -> AsyncIterator[str]:
        instruction, contents = _to_contents(messages)
        payload = {
            "contents": contents,
            **({"systemInstruction": instruction} if instruction else {}),
            **({"generationConfig": options} if options else {}),
        }
        client = self._client or httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)
        try:
            async with client.stream(
                "POST",
                f"{self._base_url}/models/{model}:streamGenerateContent",
                json=payload,
                params={"key": self._api_key, "alt": "sse"},
            ) as response:
                if response.status_code >= 400:
                    await response.aread()
                    raise ProviderError(
                        self.name, _error_message(response), status_code=response.status_code
                    )
                async for line in response.aiter_lines():
                    chunk = _parse_sse_text(line)
                    if chunk:
                        yield chunk
        except httpx.HTTPError as exc:
            raise ProviderError(self.name, str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()

    async def embed(self, texts: Sequence[str], *, model: str) -> list[list[float]]:
        body = await self._request(
            f"/models/{model}:batchEmbedContents",
            {
                "requests": [
                    {"model": f"models/{model}", "content": {"parts": [{"text": text}]}}
                    for text in texts
                ]
            },
        )
        # Order is positional here, matching the request array.
        return [item["values"] for item in body.get("embeddings", [])]


def _parse_sse_text(line: str) -> str | None:
    if not line.startswith("data:"):
        return None
    data = line[len("data:") :].strip()
    if not data:
        return None
    try:
        candidates = json.loads(data).get("candidates") or []
    except json.JSONDecodeError:
        return None
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts") or []
    return "".join(part.get("text", "") for part in parts) or None


def _error_message(response: httpx.Response) -> str:
    try:
        error = response.json().get("error")
    except ValueError:
        return response.text[:300] or f"HTTP {response.status_code}"
    if isinstance(error, dict):
        return str(error.get("message", error))[:300]
    return str(error or "")[:300]
