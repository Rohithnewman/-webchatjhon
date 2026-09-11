from pathlib import Path
from app.worker import register
from app.slices.jobs.api import JobView
from app.slices.knowledge import api, repository
from app.slices.knowledge.extract import extract_text

def chunk_text(text: str, size: int = 512, overlap: int = 50):
    words = text.split(); step = max(1, size - overlap)
    return [" ".join(words[i:i + size]) for i in range(0, len(words), step) if words[i:i + size]]

@register("ingest_document")
async def ingest_document(session, job: JobView) -> None:
    import uuid
    document = await repository.get_document(session, workspace_id=job.workspace_id, document_id=uuid.UUID(job.payload["document_id"]))
    if document is None: raise ValueError("document not found")
    document.status = "processing"; await session.flush()
    text = extract_text(Path(document.storage_path), document.content_type)
    chunks = chunk_text(text)
    await repository.replace_chunks(session, document=document, chunks=[{"ordinal": i, "content": value, "token_count": len(value.split()), "embedding": api.local_embedding(value)} for i, value in enumerate(chunks)])
