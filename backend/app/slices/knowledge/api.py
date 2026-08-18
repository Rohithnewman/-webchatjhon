import uuid
from app.core.errors import AppError
from app.slices.knowledge import repository

async def require_base(session, workspace_id: uuid.UUID, base_id: uuid.UUID):
    row = await repository.get_base(session, workspace_id=workspace_id, base_id=base_id)
    if row is None: raise AppError(code="NOT_FOUND", message="Knowledge base not found", status_code=404)
    return row

def local_embedding(text: str, dimensions: int = 32) -> list[float]:
    values = [0.0] * dimensions
    for index, token in enumerate(text.lower().split()):
        values[hash(token) % dimensions] += 1.0 / (index + 1)
    return values
