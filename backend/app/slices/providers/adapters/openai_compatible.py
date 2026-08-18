"""Adapter for every provider that speaks the OpenAI wire format.

OpenAI, Groq, Mistral and Ollama all expose `/chat/completions` and
`/embeddings` with the same request and response shapes, differing only in
base URL and auth. One adapter covers four of the six supported providers;
writing four near-identical clients would have been the obvious mistake here.
"""

import json
from collections.abc import AsyncIterator, Sequence
from typing import Any

import httpx

from app.slices.providers.adapters.base import (
    ChatMessage,
    ChatResult,
    ProviderError,
)

#: Default endpoints. A stored credential's base_url overrides these, which is
#: what lets a customer point at a proxy or a self-hosted Ollama.
DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
    "mistral": "https://api.mistral.ai/v1",
    "ollama": "http://localhost:11434/v1",
}

REQUEST_TIMEOUT_SECONDS = 60.0


class OpenAICompatibleProvider:
    def __init__(
        self,
        *,
        name: str,
        api_key: str,
        base_url: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.name = name
        self._api_key = api_key
        self._base_url = (base_url or DEFAULT_BASE_URLS.get(name, "")).rstrip("/")
        # Injectable so contract tests run against a MockTransport instead of
        # the network.
        self._client = client

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        # Ollama accepts and ignores auth; sending an empty bearer breaks it.
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        client = self._client or httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)
        try:
            response = await client.post(
                f"{self._base_url}{path}", json=payload, headers=self._headers()
            )
            if response.status_code >= 400:
                raise ProviderError(
                    self.name,
                    _error_message(response),
                    status_code=response.status_code,
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
        body = await self._post(
            "/chat/completions",
            {
                "model": model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                **options,
            },
        )
        usage = body.get("usage") or {}
        return ChatResult(
            text=body["choices"][0]["message"]["content"],
            model=body.get("model", model),
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
        )

    async def stream(
        self, messages: Sequence[ChatMessage], *, model: str, **options: Any
    ) -> AsyncIterator[str]:
        payload = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": True,
            **options,
        }
        client = self._client or httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)
        try:
            async with client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                json=payload,
                headers=self._headers(),
            ) as response:
                if response.status_code >= 400:
                    await response.aread()
                    raise ProviderError(
                        self.name, _error_message(response), status_code=response.status_code
                    )
                async for line in response.aiter_lines():
                    chunk = _parse_sse_delta(line)
                    if chunk:
                        yield chunk
        except httpx.HTTPError as exc:
            raise ProviderError(self.name, str(exc)) from exc
        finally:
            if self._client is None:
                await client.aclose()

    async def embed(self, texts: Sequence[str], *, model: str) -> list[list[float]]:
        body = await self._post("/embeddings", {"model": model, "input": list(texts)})
        # The API does not guarantee response order, and a mis-ordered batch
        # would silently attach every embedding to the wrong chunk.
        ordered = sorted(body["data"], key=lambda item: item["index"])
        return [item["embedding"] for item in ordered]


def _parse_sse_delta(line: str) -> str | None:
    if not line.startswith("data:"):
        return None
    data = line[len("data:") :].strip()
    if not data or data == "[DONE]":
        return None
    try:
        choices = json.loads(data).get("choices") or []
    except json.JSONDecodeError:
        return None
    if not choices:
        return None
    return (choices[0].get("delta") or {}).get("content") or None


def _error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:300] or f"HTTP {response.status_code}"
    error = body.get("error")
    if isinstance(error, dict):
        return str(error.get("message", error))
    return str(error or body)[:300]
