import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Protocol

from fastapi import Request

from app.core.config import settings
from app.core.errors import AppError


class RateLimiter(Protocol):
    def hit(self, key: str) -> bool: ...

    def reset(self) -> None: ...


class InProcessRateLimiter:
    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self._limit = limit
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._hits[key]
        while bucket and now - bucket[0] > self._window:
            bucket.popleft()
        if len(bucket) >= self._limit:
            return False
        bucket.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()


limiter: RateLimiter = InProcessRateLimiter(settings.RATE_LIMIT_PER_MINUTE)


def rate_limit(bucket: str) -> Callable:
    async def _dependency(request: Request) -> None:
        client_host = request.client.host if request.client else "unknown"
        if not limiter.hit(f"{bucket}:{client_host}"):
            raise AppError(
                code="RATE_LIMITED",
                message="Too many requests. Try again shortly.",
                status_code=429,
            )

    return _dependency
