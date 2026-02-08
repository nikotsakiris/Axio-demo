from fastapi import APIRouter, HTTPException

from app.models.challenge import ChallengeResponse
from app.services.rag import run_challenge
from app.storage.database import get_session

router = APIRouter()


@router.post("/{session_id}")
async def trigger_challenge(session_id: str) -> ChallengeResponse:
    sess = await get_session(session_id)
    if not sess:
        raise HTTPException(404, "session not found")
    return await run_challenge(sess)
