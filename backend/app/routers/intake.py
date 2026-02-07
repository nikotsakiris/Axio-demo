from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.models.document import Document
from app.services.document import ingest_document
from app.storage.database import get_documents_for_case, get_case

router = APIRouter()


@router.post("/upload")
async def upload_document(
    case_id: str = Form(...),
    party: str = Form(...),
    file: UploadFile = File(...),
) -> Document:
    if party not in ("A", "B"):
        raise HTTPException(400, "party must be 'A' or 'B'")
    if not file.filename:
        raise HTTPException(400, "file is required")

    case = await get_case(case_id)
    if not case:
        raise HTTPException(404, f"case {case_id} not found")

    content = await file.read()
    if not content:
        raise HTTPException(400, "empty file")

    doc = await ingest_document(case_id, party, file.filename, content)
    return doc


@router.get("/{case_id}/documents")
async def list_documents(case_id: str) -> list[Document]:
    return await get_documents_for_case(case_id)
