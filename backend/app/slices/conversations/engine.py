"""Flow execution engine.

Walks a Phase 2 flow definition one visitor turn at a time. Deliberately pure:
no DB session, no HTTP client of its own — the caller injects `Services`, so
tests bind fakes and the router binds workspace-scoped implementations.

A turn runs nodes until the flow needs visitor input (question/choice/input),
hands off, or ends. State between turns is three values the caller persists:
`current_node_id` (the wait-node the engine is parked on), `variables`, and
`status`.
"""

import asyncio
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

#: Node types that park the flow and wait for the visitor.
WAIT_NODES = frozenset({"question", "choice", "input"})

#: Executions allowed per turn before the loop guard trips.
MAX_STEPS = 50

#: Longest a `delay` node may actually sleep inside a request.
MAX_DELAY_SECONDS = 5.0

_VARIABLE_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}")
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_PATTERN = re.compile(r"^\+?[0-9 ()-]{7,20}$")


@dataclass
class Services:
    """Capabilities the engine may call, bound by the caller.

    chat(provider, model, system, history, temperature) -> str
    search(knowledge_base_id, query, top_k) -> list[str]
    http(method, url) -> tuple[int, str]
    webhook(url, payload) -> None            # errors must be swallowed inside
    """

    chat: Callable[..., Awaitable[str]]
    search: Callable[..., Awaitable[list[str]]]
    http: Callable[..., Awaitable[tuple[int, str]]]
    webhook: Callable[..., Awaitable[None]]


@dataclass
class StepResult:
    messages: list[dict[str, Any]] = field(default_factory=list)
    status: str = "active"
    current_node_id: str | None = None
    variables: dict[str, Any] = field(default_factory=dict)


class _Flow:
    def __init__(self, definition: dict[str, Any]):
        self.nodes = {node["id"]: node for node in definition.get("nodes", [])}
        self.edges_by_source: dict[str, list[dict[str, Any]]] = {}
        for edge in definition.get("edges", []):
            self.edges_by_source.setdefault(edge["source"], []).append(edge)

    def start_node(self) -> dict[str, Any] | None:
        return next(
            (node for node in self.nodes.values() if node["type"] == "start"), None
        )

    def outgoing(self, node_id: str) -> list[dict[str, Any]]:
        return self.edges_by_source.get(node_id, [])

    def follow(self, node_id: str) -> dict[str, Any] | None:
        edges = self.outgoing(node_id)
        return self.nodes.get(edges[0]["target"]) if edges else None

    def follow_labelled(
        self, node_id: str, wanted: str, fallback_index: int
    ) -> dict[str, Any] | None:
        """Pick a branch by edge label, falling back to positional order."""
        edges = self.outgoing(node_id)
        if not edges:
            return None
        wanted = wanted.strip().lower()
        for edge in edges:
            if (edge.get("label") or "").strip().lower() == wanted:
                return self.nodes.get(edge["target"])
        index = min(fallback_index, len(edges) - 1)
        return self.nodes.get(edges[index]["target"])


def interpolate(template: str, variables: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        value = variables.get(match.group(1))
        return "" if value is None else str(value)

    return _VARIABLE_PATTERN.sub(replace, template or "")


def _choice_options(node: dict[str, Any]) -> list[str]:
    raw = node.get("data", {}).get("options", "")
    if isinstance(raw, list):
        return [str(option).strip() for option in raw if str(option).strip()]
    return [line.strip() for line in str(raw).splitlines() if line.strip()]


def _validate_input(kind: str, value: str) -> bool:
    if kind == "email":
        return bool(_EMAIL_PATTERN.match(value))
    if kind == "number":
        try:
            float(value)
        except ValueError:
            return False
        return True
    if kind == "phone":
        return bool(_PHONE_PATTERN.match(value))
    if kind == "name":
        return len(value.strip()) >= 2 and any(ch.isalpha() for ch in value) and not any(ch.isdigit() for ch in value)
    if kind == "date":
        return any(_parses(value.strip(), fmt) for fmt in _DATE_FORMATS)
    return True


_URL_PATTERN = re.compile(r"^https?://\S+$")
_IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")
_VIDEO_HINTS = ("youtube.com/", "youtu.be/", ".mp4", ".webm", "vimeo.com/")
_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M")


def _parses(value: str, fmt: str) -> bool:
    from datetime import datetime

    try:
        datetime.strptime(value, fmt)
    except ValueError:
        return False
    return True


def _message_meta(data: dict[str, Any], text: str) -> dict[str, Any]:
    kind = str(data.get("kind", "") or "").lower()
    lone_url = text.strip() if _URL_PATTERN.match(text.strip() or "") else ""
    if kind in ("image", "video", "link"):
        return {"kind": kind, "url": lone_url} if lone_url else {}
    if not lone_url:
        return {}
    lowered = lone_url.lower().split("?")[0]
    if lowered.endswith(_IMAGE_SUFFIXES):
        return {"kind": "image", "url": lone_url}
    if any(hint in lone_url.lower() for hint in _VIDEO_HINTS):
        return {"kind": "video", "url": lone_url}
    return {"kind": "link", "url": lone_url}


def _is_multiple(data: dict[str, Any]) -> bool:
    return str(data.get("mode", "")).lower() == "multiple" or data.get("multiple") in (True, "true", "yes")


def _compare(left: Any, operator: str, right: str) -> bool:
    left_text = "" if left is None else str(left)
    if operator == "equals":
        return left_text.strip().lower() == right.strip().lower()
    if operator == "not_equals":
        return left_text.strip().lower() != right.strip().lower()
    if operator == "contains":
        return right.strip().lower() in left_text.lower()
    if operator in ("greater_than", "less_than"):
        try:
            left_number, right_number = float(left_text), float(right)
        except ValueError:
            return False
        return (
            left_number > right_number
            if operator == "greater_than"
            else left_number < right_number
        )
    return False


async def run(
    definition: dict[str, Any],
    *,
    services: Services,
    conversation_id: str,
    variables: dict[str, Any] | None = None,
    current_node_id: str | None = None,
    visitor_input: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> StepResult:
    """Execute one turn.

    First turn: `current_node_id` is None and the walk starts at `start`.
    Later turns: the engine is parked on a wait-node; `visitor_input` is
    consumed there, then the walk continues.
    """
    flow = _Flow(definition)
    result = StepResult(variables=dict(variables or {}))
    history = list(history or [])

    def emit(content: str, node_id: str | None, role: str = "bot", meta: dict[str, Any] | None = None) -> None:
        if content:
            result.messages.append({"role": role, "content": content, "node_id": node_id, "meta": meta or {}})

    if visitor_input is not None:
        result.variables["last_message"] = visitor_input
        history.append({"role": "user", "content": visitor_input})

    node: dict[str, Any] | None
    if current_node_id is None:
        node = flow.start_node()
    else:
        # Parked on a wait-node; consume the visitor's answer there.
        node = flow.nodes.get(current_node_id)
        if node is None:
            emit("This conversation is no longer available.", None, role="system")
            result.status = "closed"
            return result
        node = _consume_wait_node(flow, node, visitor_input or "", result)
        if node is None:  # invalid answer — re-prompted, still parked
            return result

    steps = 0
    while node is not None:
        steps += 1
        if steps > MAX_STEPS:
            emit(
                "This conversation took too many steps and was ended.",
                None,
                role="system",
            )
            result.status = "closed"
            return result

        data = node.get("data", {})
        node_type = node["type"]

        if node_type in WAIT_NODES:
            prompt = interpolate(
                str(data.get("prompt", "")) or "Please enter a value", result.variables
            )
            meta: dict[str, Any] = {}
            if node_type == "choice":
                options = _choice_options(node)
                if options:
                    prompt = prompt + "\n" + "\n".join(
                        f"{index + 1}. {option}" for index, option in enumerate(options)
                    )
                meta = {"options": options, "multiple": _is_multiple(data)}
            elif node_type == "input":
                meta = {"inputType": str(data.get("inputType", "text") or "text")}
            emit(prompt, node["id"], meta=meta)
            result.current_node_id = node["id"]
            return result

        if node_type == "start":
            node = flow.follow(node["id"])
        elif node_type == "message":
            text = interpolate(str(data.get("message", "")), result.variables)
            emit(text, node["id"], meta=_message_meta(data, text))
            node = flow.follow(node["id"])
        elif node_type == "condition":
            outcome = _compare(
                result.variables.get(str(data.get("variable", ""))),
                str(data.get("operator", "equals")),
                str(data.get("value", "")),
            )
            node = flow.follow_labelled(
                node["id"], "true" if outcome else "false", 0 if outcome else 1
            )
        elif node_type == "llm":
            system_prompt = interpolate(
                str(data.get("prompt", "")), result.variables
            )
            try:
                reply = await services.chat(
                    provider=str(data.get("provider", "openai")),
                    model=str(data.get("model", "")),
                    system=system_prompt,
                    history=history[-10:],
                    temperature=float(data.get("temperature", 0.7) or 0.7),
                )
            except Exception:  # noqa: BLE001 — a BYOK failure must not 500 the widget
                reply = "Sorry — I can't generate an answer right now."
            emit(reply, node["id"])
            history.append({"role": "assistant", "content": reply})
            node = flow.follow(node["id"])
        elif node_type == "knowledge_search":
            query = interpolate(
                str(data.get("query", "")) or "{{last_message}}", result.variables
            )
            top_k = max(1, min(int(data.get("topK", 5) or 5), 10))
            try:
                found = await services.search(
                    knowledge_base_id=str(data.get("knowledgeBaseId", "")),
                    query=query,
                    top_k=top_k,
                )
            except Exception:  # noqa: BLE001 — missing KB degrades to empty context
                found = []
            result.variables[str(data.get("variable", "") or "knowledge")] = "\n\n".join(
                found
            )
            node = flow.follow(node["id"])
        elif node_type == "http_request":
            target = str(data.get("variable", "") or "http_response")
            try:
                status_code, body = await services.http(
                    method=str(data.get("method", "GET")),
                    url=interpolate(str(data.get("url", "")), result.variables),
                )
                result.variables[target] = {"status": status_code, "body": body[:2000]}
            except Exception as exc:  # noqa: BLE001 — integrations fail soft
                result.variables[target] = {"error": str(exc)[:500]}
            node = flow.follow(node["id"])
        elif node_type == "webhook":
            await services.webhook(
                url=str(data.get("url", "")),
                payload={
                    "event": str(data.get("event", "flow.event")),
                    "conversation_id": conversation_id,
                    "variables": result.variables,
                },
            )
            node = flow.follow(node["id"])
        elif node_type == "delay":
            try:
                seconds = float(data.get("seconds", 0) or 0)
            except (TypeError, ValueError):
                seconds = 0.0
            await asyncio.sleep(max(0.0, min(seconds, MAX_DELAY_SECONDS)))
            node = flow.follow(node["id"])
        elif node_type == "handoff":
            emit(
                interpolate(
                    str(data.get("message", "")) or "Connecting you with an agent.",
                    result.variables,
                ),
                node["id"],
            )
            result.status = "handoff"
            result.current_node_id = None
            return result
        elif node_type == "end":
            emit(interpolate(str(data.get("message", "")), result.variables), node["id"])
            result.status = "closed"
            result.current_node_id = None
            return result
        else:  # unknown node type — skip rather than crash a live visitor
            node = flow.follow(node["id"])

    # Ran off the end of the graph: nothing left to execute.
    result.status = "closed"
    result.current_node_id = None
    return result


def _consume_wait_node(
    flow: _Flow,
    node: dict[str, Any],
    visitor_input: str,
    result: StepResult,
) -> dict[str, Any] | None:
    """Apply the visitor's answer to the parked wait-node.

    Returns the next node to execute, or None when the answer was invalid and
    the flow stays parked (a re-prompt has been emitted).
    """
    data = node.get("data", {})
    node_type = node["type"]
    answer = visitor_input.strip()

    def stay(message: str) -> None:
        result.messages.append(
            {"role": "bot", "content": message, "node_id": node["id"], "meta": {}}
        )
        result.current_node_id = node["id"]

    if node_type == "input":
        kind = str(data.get("inputType", "text"))
        if not _validate_input(kind, answer):
            stay(f"That doesn't look like a valid {kind}. Please try again.")
            return None
        result.variables[str(data.get("variable", "") or "input")] = answer
        return flow.follow(node["id"])

    if node_type == "choice":
        options = _choice_options(node)

        def match(token: str) -> int | None:
            token = token.strip()
            for index, option in enumerate(options):
                if token.lower() == option.lower() or token == str(index + 1):
                    return index
            return None

        if _is_multiple(data):
            picks = [match(part) for part in answer.split(",") if part.strip()]
            if not picks or any(pick is None for pick in picks):
                stay("Please pick one or more of the listed options, separated by commas.")
                return None
            chosen_list = [options[i] for i in sorted({p for p in picks if p is not None})]
            result.variables[str(data.get("variable", "") or "choice")] = ", ".join(chosen_list)
            return flow.follow(node["id"])

        chosen_index = match(answer)
        if chosen_index is None:
            stay("Please pick one of the listed options.")
            return None
        chosen = options[chosen_index]
        result.variables[str(data.get("variable", "") or "choice")] = chosen
        return flow.follow_labelled(node["id"], chosen, chosen_index)

    # question — anything goes
    result.variables[str(data.get("variable", "") or "answer")] = answer
    return flow.follow(node["id"])
