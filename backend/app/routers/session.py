import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.case import Case, Session, Treatment
from app.storage.database import (
    create_case,
    get_case,
    list_cases,
    create_session,
    get_session,
    get_sessions_for_case,
)

router = APIRouter()


class CreateCaseBody(BaseModel):
    name: str = "Untitled Case"
    description: str = ""


class CreateSessionBody(BaseModel):
    treatment: str = "neutralizer"


@router.post("/cases")
async def new_case(body: CreateCaseBody) -> Case:
    case_id = uuid.uuid4().hex[:12]
    case = Case(id=case_id, name=body.name, description=body.description)
    await create_case(case)
    return case


@router.get("/cases")
async def get_cases() -> list[Case]:
    return await list_cases()


@router.get("/cases/{case_id}")
async def get_one_case(case_id: str) -> Case:
    case = await get_case(case_id)
    if not case:
        raise HTTPException(404, "case not found")
    return case


@router.post("/cases/{case_id}/sessions")
async def new_session(case_id: str, body: CreateSessionBody) -> Session:
    case = await get_case(case_id)
    if not case:
        raise HTTPException(404, "case not found")

    try:
        t = Treatment(body.treatment)
    except ValueError:
        raise HTTPException(
            400,
            f"invalid treatment: {body.treatment}. use 'neutralizer' or 'side_by_side'",
        )

    sess_id = uuid.uuid4().hex[:12]
    sess = Session(id=sess_id, case_id=case_id, treatment=t)
    await create_session(sess)
    return sess


@router.get("/cases/{case_id}/sessions")
async def get_case_sessions(case_id: str) -> list[Session]:
    return await get_sessions_for_case(case_id)


@router.get("/sessions/{session_id}")
async def get_one_session(session_id: str) -> Session:
    sess = await get_session(session_id)
    if not sess:
        raise HTTPException(404, "session not found")
    return sess
