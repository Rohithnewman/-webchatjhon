import pytest
from pydantic import ValidationError

from app.slices.chatbots.schemas import FlowDocument


def _flow(nodes, edges=None):
    return {"nodes": nodes, "edges": edges or [], "viewport": {"x": 0, "y": 0, "zoom": 1}}


def test_all_thirteen_node_types_are_accepted():
    node_types = [
        "start",
        "message",
        "question",
        "choice",
        "condition",
        "input",
        "llm",
        "knowledge_search",
        "http_request",
        "webhook",
        "delay",
        "handoff",
        "end",
    ]
    document = FlowDocument.model_validate(
        _flow(
            [
                {
                    "id": node_type,
                    "type": node_type,
                    "position": {"x": index * 100, "y": 0},
                    "data": {"label": node_type},
                }
                for index, node_type in enumerate(node_types)
            ]
        )
    )
    assert len(document.nodes) == 13


@pytest.mark.parametrize(
    "payload",
    [
        _flow([{"id": "message", "type": "message", "position": {"x": 0, "y": 0}, "data": {}}]),
        _flow(
            [
                {"id": "start", "type": "start", "position": {"x": 0, "y": 0}, "data": {}},
                {"id": "start", "type": "end", "position": {"x": 100, "y": 0}, "data": {}},
            ]
        ),
        _flow(
            [{"id": "start", "type": "start", "position": {"x": 0, "y": 0}, "data": {}}],
            [{"id": "broken", "source": "start", "target": "missing"}],
        ),
    ],
)
def test_invalid_graphs_are_rejected(payload):
    with pytest.raises(ValidationError):
        FlowDocument.model_validate(payload)
