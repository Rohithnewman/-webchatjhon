import uuid
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.slices.knowledge.models import Document, DocumentChunk, KnowledgeBase


async def create_base(session: AsyncSession, *, workspace_id: uuid.UUID, name: str, description: str) -> KnowledgeBase:
    row = KnowledgeBase(workspace_id=workspace_id, name=name, description=description)
    session.add(row); await session.flush(); return row


async def list_bases(session: AsyncSession, *, workspace_id: uuid.UUID) -> list[KnowledgeBase]:
    return list((await session.execute(select(KnowledgeBase).where(KnowledgeBase.workspace_id == workspace_id).order_by(KnowledgeBase.created_at))).scalars().all())


async def get_base(session: AsyncSession, *, workspace_id: uuid.UUID, base_id: uuid.UUID) -> KnowledgeBase | None:
    return (await session.execute(select(KnowledgeBase).where(KnowledgeBase.id == base_id, KnowledgeBase.workspace_id == workspace_id))).scalar_one_or_none()


async def create_document(session: AsyncSession, **values) -> Document:
    row = Document(**values); session.add(row); await session.flush(); return row


async def list_documents(session: AsyncSession, *, workspace_id: uuid.UUID, base_id: uuid.UUID) -> list[Document]:
    return list((await session.execute(select(Document).where(Document.workspace_id == workspace_id, Document.knowledge_base_id == base_id).order_by(Document.created_at.desc()))).scalars().all())


async def get_document(session: AsyncSession, *, workspace_id: uuid.UUID, document_id: uuid.UUID) -> Document | None:
    return (await session.execute(select(Document).where(Document.id == document_id, Document.workspace_id == workspace_id))).scalar_one_or_none()


async def replace_chunks(session: AsyncSession, *, document: Document, chunks: list[dict]) -> None:
    await session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
    for values in chunks:
        session.add(DocumentChunk(workspace_id=document.workspace_id, document_id=document.id, knowledge_base_id=document.knowledge_base_id, **values))
    await session.execute(update(Document).where(Document.id == document.id).values(status="ready", chunk_count=len(chunks), error=None))


async def search_chunks(session: AsyncSession, *, workspace_id: uuid.UUID, base_id: uuid.UUID, embedding: list[float], limit: int) -> list[tuple[DocumentChunk, float]]:
    rows = (await session.execute(select(DocumentChunk).where(DocumentChunk.workspace_id == workspace_id, DocumentChunk.knowledge_base_id == base_id))).scalars().all()
    import math
    def cosine(a, b):
        dot = sum(x * y for x, y in zip(a, b)); na = math.sqrt(sum(x*x for x in a)); nb = math.sqrt(sum(x*x for x in b))
        return dot / (na * nb) if na and nb else 0.0
    return sorted(((row, cosine(row.embedding, embedding)) for row in rows), key=lambda item: item[1], reverse=True)[:limit]
