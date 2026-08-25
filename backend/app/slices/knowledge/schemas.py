import uuid
from pydantic import BaseModel, Field

class KnowledgeBaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=500)

class KnowledgeBaseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)

class KnowledgeBaseOut(BaseModel):
    id: uuid.UUID; name: str; description: str; embedding_provider: str; embedding_model: str; embedding_dimensions: int

class DocumentOut(BaseModel):
    id: uuid.UUID; knowledge_base_id: uuid.UUID; filename: str; content_type: str; byte_size: int; status: str; error: str | None; chunk_count: int

class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    limit: int = Field(default=5, ge=1, le=20)
