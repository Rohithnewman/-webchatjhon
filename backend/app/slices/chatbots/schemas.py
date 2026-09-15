import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

NodeType = Literal[
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


class Position(BaseModel):
    x: float = Field(ge=-100_000, le=100_000)
    y: float = Field(ge=-100_000, le=100_000)


class FlowNode(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    type: NodeType
    position: Position
    data: dict[str, Any] = Field(default_factory=dict)


class FlowEdge(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=100)
    target: str = Field(min_length=1, max_length=100)
    sourceHandle: str | None = Field(default=None, max_length=100)
    targetHandle: str | None = Field(default=None, max_length=100)
    label: str | None = Field(default=None, max_length=120)


class Viewport(BaseModel):
    x: float = 0
    y: float = 0
    zoom: float = Field(default=1, ge=0.1, le=4)


class FlowDocument(BaseModel):
    nodes: list[FlowNode] = Field(min_length=1, max_length=250)
    edges: list[FlowEdge] = Field(default_factory=list, max_length=500)
    viewport: Viewport = Field(default_factory=Viewport)
    design: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_graph(self) -> "FlowDocument":
        node_ids = [node.id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("node IDs must be unique")
        edge_ids = [edge.id for edge in self.edges]
        if len(edge_ids) != len(set(edge_ids)):
            raise ValueError("edge IDs must be unique")
        starts = [node for node in self.nodes if node.type == "start"]
        if len(starts) != 1:
            raise ValueError("flow must contain exactly one start node")
        known = set(node_ids)
        for edge in self.edges:
            if edge.source not in known or edge.target not in known:
                raise ValueError("every edge must reference existing nodes")
        start_id = starts[0].id
        end_ids = {node.id for node in self.nodes if node.type == "end"}
        if any(edge.target == start_id for edge in self.edges):
            raise ValueError("start node cannot have incoming edges")
        if any(edge.source in end_ids for edge in self.edges):
            raise ValueError("end nodes cannot have outgoing edges")

        import json

        if len(json.dumps(self.design)) > 300_000:
            raise ValueError("design settings are too large (keep the avatar under 200 KB)")
        return self


class ChatbotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class ChatbotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: Literal["draft", "published", "archived"] | None = None

    @model_validator(mode="after")
    def require_change(self) -> "ChatbotUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        return self


class ChatbotOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    description: str
    status: str
    current_version: int | None = None


class FlowOut(BaseModel):
    id: uuid.UUID
    chatbot_id: uuid.UUID
    workspace_id: uuid.UUID
    version: int
    definition: FlowDocument
    is_current: bool
    created_by: uuid.UUID


class FlowVersionOut(BaseModel):
    id: uuid.UUID
    version: int
    is_current: bool
    created_by: uuid.UUID
    created_at: str
