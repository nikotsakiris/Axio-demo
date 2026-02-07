import os
import tempfile
import uuid

import pdfplumber

from app.config import settings
from app.models.document import Document, Chunk
from app.services.llm import embed_texts
from app.storage.database import save_document, save_chunks
from app.storage.vector import upsert_chunks

SUPPORTED_EXTENSIONS = {".pdf"}


async def ingest_document(
    case_id: str, party: str, filename: str, content: bytes,
) -> Document:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"unsupported file type: {ext}")

    if not content:
        raise ValueError("empty file")

    doc_id = uuid.uuid4().hex[:12]

    case_dir = os.path.join(settings.upload_dir, case_id)
    os.makedirs(case_dir, exist_ok=True)
    storage_path = os.path.join(case_id, f"{doc_id}_{filename}")
    full_path = os.path.join(settings.upload_dir, storage_path)
    with open(full_path, "wb") as f:
        f.write(content)

    pages_text, page_count = _extract_text(content)
    if not pages_text:
        raise ValueError(f"no text extracted from {filename}")

    doc = Document(
        id=doc_id,
        case_id=case_id,
        party=party,
        filename=filename,
        page_count=page_count,
        storage_path=storage_path,
    )
    await save_document(doc)

    chunks = _chunk_pages(doc, pages_text)
    if not chunks:
        raise ValueError(f"no chunks produced from {filename}")

    texts_to_embed = [c.text for c in chunks]
    embeddings = await embed_texts(texts_to_embed)
    await upsert_chunks(chunks, embeddings)
    await save_chunks(chunks)
    return doc


def _extract_text(content: bytes) -> tuple[list[tuple[int, str]], int]:
    pages_text: list[tuple[int, str]] = []
    page_count = 0

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        with pdfplumber.open(tmp_path) as pdf:
            page_count = len(pdf.pages)
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                if text.strip():
                    pages_text.append((i + 1, text))
    finally:
        os.unlink(tmp_path)

    return pages_text, page_count


def _chunk_pages(doc: Document, pages_text: list[tuple[int, str]]) -> list[Chunk]:
    chunks: list[Chunk] = []
    chunk_size = settings.chunk_size_chars
    overlap = settings.chunk_overlap_chars

    for page_num, full_text in pages_text:
        paragraphs = [p.strip() for p in full_text.split("\n\n") if p.strip()]
        current_section = ""
        section_title = ""

        for para in paragraphs:
            lines = para.split("\n")
            if (
                len(lines) == 1
                and len(para) < 120
                and (para.isupper() or para.istitle())
                and not para.endswith(".")
            ):
                if current_section.strip():
                    _split_into_chunks(
                        chunks, doc, page_num, current_section, section_title, chunk_size, overlap,
                    )
                    current_section = ""
                section_title = para
                continue

            current_section += para + "\n\n"

            if len(current_section) >= chunk_size * 2:
                _split_into_chunks(
                    chunks, doc, page_num, current_section, section_title, chunk_size, overlap,
                )
                current_section = ""

        if current_section.strip():
            _split_into_chunks(
                chunks, doc, page_num, current_section, section_title, chunk_size, overlap,
            )

    return chunks


def _split_into_chunks(
    chunks: list[Chunk],
    doc: Document,
    page_num: int,
    section_text: str,
    section_title: str,
    chunk_size: int,
    overlap: int,
):
    text = section_text.strip()
    if not text:
        return

    parent_text = text

    if len(text) <= chunk_size:
        chunk_id = f"{doc.id}:{page_num}:0-{len(text)}"
        chunks.append(Chunk(
            id=chunk_id, doc_id=doc.id, case_id=doc.case_id, party=doc.party,
            filename=doc.filename, page=page_num, start_char=0, end_char=len(text),
            text=text, parent_text=parent_text, section_title=section_title,
        ))
        return

    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk_text = text[start:end]

        if end < len(text) and len(chunk_text) > 50:
            last_period = chunk_text.rfind(". ")
            last_newline = chunk_text.rfind("\n")
            break_at = max(last_period, last_newline)
            if break_at > len(chunk_text) * 0.5:
                end = start + break_at + 1
                chunk_text = text[start:end]

        chunk_id = f"{doc.id}:{page_num}:{start}-{end}"
        chunks.append(Chunk(
            id=chunk_id, doc_id=doc.id, case_id=doc.case_id, party=doc.party,
            filename=doc.filename, page=page_num, start_char=start, end_char=end,
            text=chunk_text.strip(), parent_text=parent_text, section_title=section_title,
        ))

        if end >= len(text):
            break
        start = end - overlap
        start = max(start, 0)
        if start <= chunks[-1].start_char:
            break
