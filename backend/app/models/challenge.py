from __future__ import annotations

from pydantic import BaseModel


class Citation(BaseModel):
    chunk_id: str
    doc_name: str
    page: int
    snippet: str


class ChallengeRequest(BaseModel):
    session_id: str


class ChallengeResponse(BaseModel):
    treatment: str
    query_used: str
    no_evidence: bool = False

    # neutralizer fields
    summary: str = ""
    citations: list[Citation] = []

    # side_by_side fields
    party_a_evidence: str = ""
    party_a_citations: list[Citation] = []
    party_b_evidence: str = ""
    party_b_citations: list[Citation] = []
