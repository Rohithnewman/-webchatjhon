import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.authz import api as authz_api
from app.slices.jobs import api as jobs_api
from app.slices.knowledge import api, repository
from app.slices.knowledge.schemas import DocumentOut, KnowledgeBaseCreate, KnowledgeBaseOut, SearchRequest

router = APIRouter(prefix="/api/v1/knowledge-bases", tags=["knowledge"])
read_context = authz_api.require_permission(permissions.FEATURES_READ)
write_context = authz_api.require_permission(permissions.FEATURES_USE)

def base_out(row): return KnowledgeBaseOut(id=row.id, name=row.name, description=row.description, embedding_provider=row.embedding_provider, embedding_model=row.embedding_model, embedding_dimensions=row.embedding_dimensions).model_dump(mode="json")
def doc_out(row): return DocumentOut(id=row.id, knowledge_base_id=row.knowledge_base_id, filename=row.filename, content_type=row.content_type, byte_size=row.byte_size, status=row.status, error=row.error, chunk_count=row.chunk_count).model_dump(mode="json")

@router.get("")
async def list_bases(ctx: WorkspaceContext = Depends(read_context), session: AsyncSession = Depends(get_session)): return success([base_out(x) for x in await repository.list_bases(session, workspace_id=ctx.workspace_id)])

@router.post("", status_code=201)
async def create_base(body: KnowledgeBaseCreate, ctx: WorkspaceContext = Depends(write_context), session: AsyncSession = Depends(get_session)):
    row = await repository.create_base(session, workspace_id=ctx.workspace_id, name=body.name, description=body.description); await session.commit(); return success(base_out(row))

@router.get("/{base_id}/documents")
async def list_docs(base_id: uuid.UUID, ctx: WorkspaceContext = Depends(read_context), session: AsyncSession = Depends(get_session)):
    await api.require_base(session, ctx.workspace_id, base_id); return success([doc_out(x) for x in await repository.list_documents(session, workspace_id=ctx.workspace_id, base_id=base_id)])

@router.post("/{base_id}/documents", status_code=202)
async def upload_doc(base_id: uuid.UUID, file: UploadFile = File(...), ctx: WorkspaceContext = Depends(write_context), session: AsyncSession = Depends(get_session)):
    await api.require_base(session, ctx.workspace_id, base_id)
    content = await file.read()
    if not content or len(content) > 20 * 1024 * 1024: raise AppError(code="INVALID_DOCUMENT", message="Document must be between 1 byte and 20 MB", status_code=400)
    safe_name = Path(file.filename or "document.txt").name
    storage = Path("storage") / str(ctx.workspace_id) / str(base_id); storage.mkdir(parents=True, exist_ok=True)
    path = storage / f"{uuid.uuid4()}-{safe_name}"; path.write_bytes(content)
    row = await repository.create_document(session, workspace_id=ctx.workspace_id, knowledge_base_id=base_id, filename=safe_name, content_type=file.content_type or "application/octet-stream", byte_size=len(content), storage_path=str(path))
    await jobs_api.enqueue(session, kind="ingest_document", workspace_id=ctx.workspace_id, payload={"document_id": str(row.id)}); await session.commit(); return success(doc_out(row))

@router.post("/{base_id}/search")
async def search(base_id: uuid.UUID, body: SearchRequest, ctx: WorkspaceContext = Depends(read_context), session: AsyncSession = Depends(get_session)):
    base = await api.require_base(session, ctx.workspace_id, base_id); rows = await repository.search_chunks(session, workspace_id=ctx.workspace_id, base_id=base.id, embedding=api.local_embedding(body.query, base.embedding_dimensions), limit=body.limit)
    return success([{"id": str(row.id), "document_id": str(row.document_id), "content": row.content, "score": score} for row, score in rows])
