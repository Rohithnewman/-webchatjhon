"""Install verification: fetch a customer page and look for this bot's widget tag.

No database access here — the router owns persistence. `fetch_page` is the
seam tests replace so no test ever touches the network.
"""
import asyncio
import ipaddress
import re
import socket

import httpx

from app.core.errors import AppError

TIMEOUT_SECONDS = 5.0
MAX_BYTES = 1_000_000
MAX_REDIRECTS = 3
_ID_ATTR = re.compile(r"""data-chatbot-id\s*=\s*["']([^"']+)["']""", re.IGNORECASE)


def _invalid(message: str) -> AppError:
    return AppError(code="VALIDATION_ERROR", message=message, status_code=400)


async def _is_internal(host: str) -> bool:
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError, ValueError):
        return True
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return True
    return False


# DNS rebinding between this check and the later fetch is accepted for this product.
async def check_url(url: str, *, allowed_host: str) -> httpx.URL:
    """Only public http(s) URLs pass, plus the app's own host (so /demo verifies)."""
    try:
        parsed = httpx.URL(url.strip())
    except Exception as exc:  # httpx raises InvalidURL subclasses
        raise _invalid("Enter a valid website URL") from exc
    if parsed.scheme not in ("http", "https") or not parsed.host:
        raise _invalid("Enter a full URL starting with http:// or https://")
    host = parsed.host.lower()
    if host != allowed_host.lower() and await _is_internal(host):
        raise _invalid("Enter the public URL of your website")
    return parsed


async def fetch_page(url: httpx.URL, *, allowed_host: str) -> tuple[str, str] | None:
    """Return (final_url, body) or None when the page cannot be fetched."""
    headers = {"User-Agent": "WebChatBots-Verifier"}
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False, headers=headers) as client:
        current = url
        try:
            async with asyncio.timeout(TIMEOUT_SECONDS):
                for _ in range(MAX_REDIRECTS + 1):
                    async with client.stream("GET", current) as response:
                        if response.is_redirect and response.next_request is not None:
                            try:
                                current = await check_url(str(response.next_request.url), allowed_host=allowed_host)
                            except AppError:
                                return None
                            continue
                        if not response.is_success:
                            return None
                        chunks: list[bytes] = []
                        size = 0
                        async for chunk in response.aiter_bytes():
                            chunks.append(chunk)
                            size += len(chunk)
                            if size >= MAX_BYTES:
                                break
                        return str(current), b"".join(chunks).decode("utf-8", errors="replace")
                return None
        except (httpx.HTTPError, httpx.InvalidURL, UnicodeError, ValueError, TimeoutError):
            return None


def inspect_page(body: str, chatbot_id: str) -> str:
    """'connected' | 'script_missing' | 'wrong_chatbot'."""
    if "widget.js" not in body:
        return "script_missing"
    ids = _ID_ATTR.findall(body)
    if chatbot_id in ids:
        return "connected"
    return "wrong_chatbot" if ids else "script_missing"
