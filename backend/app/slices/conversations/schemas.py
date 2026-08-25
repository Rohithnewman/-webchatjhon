import uuid

from pydantic import BaseModel, Field


class ConversationStart(BaseModel):
    chatbot_id: uuid.UUID


class VisitorMessage(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class AgentMessage(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: uuid.UUID
    ordinal: int
    role: str
    content: str
    node_id: str | None
    created_at: str


class ConversationOut(BaseModel):
    id: uuid.UUID
    chatbot_id: uuid.UUID
    status: str
    visitor_label: str
    flow_version: int
    created_at: str
    updated_at: str
