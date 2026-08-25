"""Engine unit tests. No database, no network — fake services only."""

import pytest

from app.slices.conversations.engine import Services, interpolate, run


def make_services(**overrides):
    async def chat(**_kwargs):
        return "AI says hi"

    async def search(**_kwargs):
        return ["chunk one", "chunk two"]

    async def http(**_kwargs):
        return 200, '{"ok": true}'

    async def webhook(**_kwargs):
        return None

    defaults = {"chat": chat, "search": search, "http": http, "webhook": webhook}
    defaults.update(overrides)
    return Services(**defaults)


def flow(nodes, edges):
    return {
        "nodes": [
            {"id": n[0], "type": n[1], "position": {"x": 0, "y": 0}, "data": n[2]}
            for n in nodes
        ],
        "edges": [
            {
                "id": f"e{i}",
                "source": e[0],
                "target": e[1],
                **({"label": e[2]} if len(e) > 2 else {}),
            }
            for i, e in enumerate(edges)
        ],
    }


SIMPLE = flow(
    [
        ("s", "start", {}),
        ("m", "message", {"message": "Hello {{name}}"}),
        ("e", "end", {"message": "Bye"}),
    ],
    [("s", "m"), ("m", "e")],
)


def test_interpolate_replaces_known_and_blanks_unknown():
    assert interpolate("Hi {{a}} {{missing}}!", {"a": "there"}) == "Hi there !"


async def test_message_flow_runs_to_end():
    result = await run(SIMPLE, services=make_services(), conversation_id="c1")
    assert [m["content"] for m in result.messages] == ["Hello ", "Bye"]
    assert result.status == "closed"
    assert result.current_node_id is None


async def test_question_parks_then_resumes_with_variable():
    definition = flow(
        [
            ("s", "start", {}),
            ("q", "question", {"prompt": "Name?", "variable": "name"}),
            ("m", "message", {"message": "Hi {{name}}"}),
            ("e", "end", {}),
        ],
        [("s", "q"), ("q", "m"), ("m", "e")],
    )
    first = await run(definition, services=make_services(), conversation_id="c1")
    assert first.current_node_id == "q"
    assert first.status == "active"
    assert first.messages[-1]["content"] == "Name?"

    second = await run(
        definition,
        services=make_services(),
        conversation_id="c1",
        variables=first.variables,
        current_node_id="q",
        visitor_input="Ada",
    )
    assert second.variables["name"] == "Ada"
    assert [m["content"] for m in second.messages] == ["Hi Ada"]
    assert second.status == "closed"


async def test_input_validation_reprompts_until_valid():
    definition = flow(
        [
            ("s", "start", {}),
            ("i", "input", {"prompt": "Email?", "variable": "email", "inputType": "email"}),
            ("e", "end", {"message": "Done"}),
        ],
        [("s", "i"), ("i", "e")],
    )
    parked = await run(definition, services=make_services(), conversation_id="c1")

    invalid = await run(
        definition,
        services=make_services(),
        conversation_id="c1",
        variables=parked.variables,
        current_node_id="i",
        visitor_input="not-an-email",
    )
    assert invalid.current_node_id == "i"
    assert "valid email" in invalid.messages[0]["content"]

    valid = await run(
        definition,
        services=make_services(),
        conversation_id="c1",
        variables=invalid.variables,
        current_node_id="i",
        visitor_input="ada@example.com",
    )
    assert valid.variables["email"] == "ada@example.com"
    assert valid.status == "closed"


async def test_choice_matches_label_and_follows_labelled_edge():
    definition = flow(
        [
            ("s", "start", {}),
            ("c", "choice", {"prompt": "Pick", "options": "Sales\nSupport", "variable": "team"}),
            ("a", "message", {"message": "Sales here"}),
            ("b", "message", {"message": "Support here"}),
            ("e", "end", {}),
        ],
        [("s", "c"), ("c", "a", "Sales"), ("c", "b", "Support"), ("a", "e"), ("b", "e")],
    )
    parked = await run(definition, services=make_services(), conversation_id="c1")
    assert "1. Sales" in parked.messages[0]["content"]

    # Answering by 1-based index also works.
    result = await run(
        definition,
        services=make_services(),
        conversation_id="c1",
        variables=parked.variables,
        current_node_id="c",
        visitor_input="2",
    )
    assert result.variables["team"] == "Support"
    assert result.messages[0]["content"] == "Support here"

    rejected = await run(
        definition,
        services=make_services(),
        conversation_id="c1",
        variables=parked.variables,
        current_node_id="c",
        visitor_input="Bananas",
    )
    assert rejected.current_node_id == "c"


async def test_condition_selects_branch_by_edge_label():
    definition = flow(
        [
            ("s", "start", {}),
            ("c", "condition", {"variable": "tier", "operator": "equals", "value": "vip"}),
            ("y", "message", {"message": "Welcome VIP"}),
            ("n", "message", {"message": "Welcome"}),
            ("e", "end", {}),
        ],
        [("s", "c"), ("c", "y", "true"), ("c", "n", "false"), ("y", "e"), ("n", "e")],
    )
    vip = await run(
        definition,
        services=make_services(),
        conversation_id="c1",
        variables={"tier": "VIP"},
    )
    assert vip.messages[0]["content"] == "Welcome VIP"

    plain = await run(
        definition,
        services=make_services(),
        conversation_id="c1",
        variables={"tier": "basic"},
    )
    assert plain.messages[0]["content"] == "Welcome"


async def test_llm_node_emits_reply_and_provider_failure_degrades():
    definition = flow(
        [
            ("s", "start", {}),
            ("l", "llm", {"prompt": "Be helpful", "provider": "openai"}),
            ("e", "end", {}),
        ],
        [("s", "l"), ("l", "e")],
    )
    ok = await run(definition, services=make_services(), conversation_id="c1")
    assert ok.messages[0]["content"] == "AI says hi"

    async def broken_chat(**_kwargs):
        raise RuntimeError("no credential")

    degraded = await run(
        definition,
        services=make_services(chat=broken_chat),
        conversation_id="c1",
    )
    assert "can't generate" in degraded.messages[0]["content"]
    assert degraded.status == "closed"  # flow still completed


async def test_knowledge_search_stores_results_in_variable():
    definition = flow(
        [
            ("s", "start", {}),
            ("k", "knowledge_search", {"query": "{{last_message}}", "topK": 2, "knowledgeBaseId": "kb", "variable": "context"}),
            ("m", "message", {"message": "Found: {{context}}"}),
            ("e", "end", {}),
        ],
        [("s", "k"), ("k", "m"), ("m", "e")],
    )
    result = await run(definition, services=make_services(), conversation_id="c1")
    assert result.messages[0]["content"] == "Found: chunk one\n\nchunk two"


async def test_http_request_failure_is_soft():
    async def broken_http(**_kwargs):
        raise RuntimeError("connection refused")

    definition = flow(
        [
            ("s", "start", {}),
            ("h", "http_request", {"url": "https://x.test", "method": "GET"}),
            ("e", "end", {"message": "Done"}),
        ],
        [("s", "h"), ("h", "e")],
    )
    result = await run(
        definition, services=make_services(http=broken_http), conversation_id="c1"
    )
    assert "error" in result.variables["http_response"]
    assert result.status == "closed"


async def test_handoff_stops_the_flow():
    definition = flow(
        [
            ("s", "start", {}),
            ("h", "handoff", {"message": "Agent coming"}),
            ("m", "message", {"message": "Never reached"}),
        ],
        [("s", "h"), ("h", "m")],
    )
    result = await run(definition, services=make_services(), conversation_id="c1")
    assert result.status == "handoff"
    assert [m["content"] for m in result.messages] == ["Agent coming"]


async def test_loop_guard_closes_runaway_flows():
    definition = flow(
        [("s", "start", {}), ("a", "message", {"message": "x"}), ("b", "message", {"message": "y"})],
        [("s", "a"), ("a", "b"), ("b", "a")],
    )
    result = await run(definition, services=make_services(), conversation_id="c1")
    assert result.status == "closed"
    assert result.messages[-1]["role"] == "system"


async def test_webhook_node_posts_payload():
    calls = []

    async def capture_webhook(**kwargs):
        calls.append(kwargs)

    definition = flow(
        [
            ("s", "start", {}),
            ("w", "webhook", {"url": "https://hooks.test", "event": "lead.created"}),
            ("e", "end", {}),
        ],
        [("s", "w"), ("w", "e")],
    )
    await run(
        definition,
        services=make_services(webhook=capture_webhook),
        conversation_id="c99",
        variables={"name": "Ada"},
    )
    assert calls[0]["url"] == "https://hooks.test"
    assert calls[0]["payload"]["event"] == "lead.created"
    assert calls[0]["payload"]["conversation_id"] == "c99"
    assert calls[0]["payload"]["variables"]["name"] == "Ada"
