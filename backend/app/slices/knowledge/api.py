import uuid
import zlib
from app.core.errors import AppError
from app.slices.knowledge import repository

async def require_base(session, workspace_id: uuid.UUID, base_id: uuid.UUID):
    row = await repository.get_base(session, workspace_id=workspace_id, base_id=base_id)
    if row is None: raise AppError(code="NOT_FOUND", message="Knowledge base not found", status_code=404)
    return row

def local_embedding(text: str, dimensions: int = 32) -> list[float]:
    """Deterministic bag-of-words embedding used until a real embedding
    provider is wired in. Uses crc32, not hash(): hash() is salted per
    process, and the worker and the API are different processes."""
    values = [0.0] * dimensions
    for index, token in enumerate(text.lower().split()):
        values[zlib.crc32(token.encode("utf-8")) % dimensions] += 1.0 / (index + 1)
    return values


async def search(session, *, workspace_id: uuid.UUID, knowledge_base_id: uuid.UUID, query: str, limit: int = 5) -> list[dict]:
    """Retrieval seam for other slices (spec §7). Raises NOT_FOUND for a base
    outside the workspace, so callers cannot probe across tenants."""
    base = await require_base(session, workspace_id, knowledge_base_id)
    rows = await repository.search_chunks(session, workspace_id=workspace_id, base_id=base.id, embedding=local_embedding(query, base.embedding_dimensions), limit=limit)
    return [{"content": row.content, "score": score, "document_id": str(row.document_id)} for row, score in rows]
