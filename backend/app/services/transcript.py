from datetime import datetime, timezone
from dataclasses import dataclass, field
from collections import defaultdict

from app.config import settings


@dataclass
class Turn:
    speaker: str
    text: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


_buffers: dict[str, list[Turn]] = defaultdict(list)


async def add_turn(session_id: str, speaker: str, text: str):
    """add a transcript turn, consolidating consecutive same-speaker segments.
    persists raw turn to PostgreSQL for recovery after server restart."""
    turns = _buffers[session_id]
    if turns and turns[-1].speaker == speaker:
        turns[-1].text += " " + text
        turns[-1].timestamp = datetime.now(timezone.utc)
    else:
        turns.append(Turn(speaker=speaker, text=text))
    _enforce_window(session_id)

    from app.storage.database import save_transcript_turn
    await save_transcript_turn(session_id, speaker, text)


async def get_turns(session_id: str) -> list[Turn]:
    """return turns from in-memory buffer, hydrating from DB if empty."""
    if not _buffers.get(session_id):
        await _hydrate_from_db(session_id)
    return list(_buffers.get(session_id, []))


def format_turns(turns: list[Turn]) -> str:
    return "\n".join(f"{t.speaker}: {t.text}" for t in turns)


async def clear_buffer(session_id: str):
    _buffers.pop(session_id, None)
    from app.storage.database import clear_transcript_turns
    await clear_transcript_turns(session_id)


def _enforce_window(session_id: str):
    turns = _buffers[session_id]
    while len(turns) > settings.transcript_turns:
        turns.pop(0)


async def _hydrate_from_db(session_id: str):
    """rebuild in-memory buffer from persisted turns on first access"""
    from app.storage.database import get_transcript_turns
    rows = await get_transcript_turns(session_id)
    if not rows:
        return
    # replay raw turns through consolidation logic
    for row in rows:
        turns = _buffers[session_id]
        if turns and turns[-1].speaker == row["speaker"]:
            turns[-1].text += " " + row["text"]
            turns[-1].timestamp = row["created_at"]
        else:
            turns.append(Turn(
                speaker=row["speaker"], text=row["text"], timestamp=row["created_at"],
            ))
    _enforce_window(session_id)
