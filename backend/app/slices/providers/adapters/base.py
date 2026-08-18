"""The one interface every provider is reached through.

Architecture section 3.5: the RAG query service and the flow `llm` /
`knowledge_search` nodes call this protocol only. No vendor SDK is imported
outside its own adapter module, so adding or dropping a provider never touches
calling code.
"""

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol, runtime_checkable

Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class ChatMessage:
    role: Role
    content: str


@dataclass(frozen=True)
class ChatResult:
    text: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class ProviderError(Exception):
    """A provider call failed.

    Carries the provider name and, where the API gave one, its status code —
    so a 401 from a bad customer key is distinguishable from a 500 that is
    worth retrying.
    """

    def __init__(self, provider: str, message: str, *, status_code: int | None = None):
        self.provider = provider
        self.status_code = status_code
        super().__init__(f"{provider}: {message}")

    @property
    def retryable(self) -> bool:
        """429 and 5xx are transient; everything else is the caller's fault."""
        if self.status_code is None:
            return True
        return self.status_code == 429 or self.status_code >= 500


class UnsupportedCapability(ProviderError):
    """The provider genuinely cannot do this, so retrying is pointless.

    Anthropic, for instance, publishes no embeddings endpoint.
    """

    def __init__(self, provider: str, capability: str):
        super().__init__(provider, f"does not support {capability}", status_code=400)

    @property
    def retryable(self) -> bool:
        return False


@runtime_checkable
class LLMProvider(Protocol):
    name: str

    async def chat(
        self, messages: Sequence[ChatMessage], *, model: str, **options: object
    ) -> ChatResult: ...

    def stream(
        self, messages: Sequence[ChatMessage], *, model: str, **options: object
    ) -> AsyncIterator[str]: ...

    async def embed(self, texts: Sequence[str], *, model: str) -> list[list[float]]: ...
