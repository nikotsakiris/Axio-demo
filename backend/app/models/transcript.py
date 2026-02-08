from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class Turn(BaseModel):
    speaker_id: str = ""
    speaker_name: str = ""
    party: str = ""  # "A", "B", or "" if unmapped
    text: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    token_count: int = 0


class TranscriptBufferState(BaseModel):
    session_id: str
    turns: list[Turn] = []
    total_tokens: int = 0
