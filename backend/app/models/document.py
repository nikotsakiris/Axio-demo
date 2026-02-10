from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class Document(BaseModel):
    id: str
    case_id: str
    party: str  # "A" or "B"
    filename: str
    page_count: int = 0
    storage_path: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Chunk(BaseModel):
    id: str  # {doc_id}:{page}:{start_char}-{end_char}
    doc_id: str
    case_id: str
    party: str
    filename: str
    page: int
    start_char: int
    end_char: int
    text: str
    parent_text: str = ""  # parent section for richer generation context
    section_title: str = ""
