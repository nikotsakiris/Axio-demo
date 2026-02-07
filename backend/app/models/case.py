from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class Party(str, enum.Enum):
    A = "A"
    B = "B"


class Treatment(str, enum.Enum):
    NEUTRALIZER = "neutralizer"
    SIDE_BY_SIDE = "side_by_side"


class CaseCreate(BaseModel):
    name: str
    description: str = ""


class Case(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str
    description: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RosterMapping(BaseModel):
    zoom_user_id: str
    zoom_user_name: str
    party: Party


class SessionCreate(BaseModel):
    case_id: str
    zoom_meeting_id: str = ""
    roster: list[RosterMapping] = []


class Session(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    case_id: str
    zoom_meeting_id: str = ""
    treatment: Treatment = Treatment.NEUTRALIZER
    roster: list[RosterMapping] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    active: bool = True
