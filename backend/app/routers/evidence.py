import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.storage.database import get_document, get_chunk

router = APIRouter()


@router.get("/{doc_id}/pdf")
async def serve_pdf(doc_id: str):
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "document not found")

    full_path = os.path.join(settings.upload_dir, doc.storage_path)
    if not os.path.isfile(full_path):
        raise HTTPException(404, "file not found on disk")

    return FileResponse(full_path, media_type="application/pdf", filename=doc.filename)


@router.get("/{doc_id}/chunk/{chunk_id}")
async def get_chunk_context(doc_id: str, chunk_id: str):
    chunk = await get_chunk(chunk_id)
    if not chunk or chunk.doc_id != doc_id:
        raise HTTPException(404, "chunk not found")

    return {
        "chunk_id": chunk.id,
        "doc_id": chunk.doc_id,
        "filename": chunk.filename,
        "page": chunk.page,
        "text": chunk.text,
        "parent_text": chunk.parent_text,
        "section_title": chunk.section_title,
    }
