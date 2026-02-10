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


def add_turn(session_id: str, speaker: str, text: str):
    # consolidate consecutive segments from same speaker
    turns = _buffers[session_id]
    if turns and turns[-1].speaker == speaker:
        turns[-1].text += " " + text
        turns[-1].timestamp = datetime.now(timezone.utc)
    else:
        turns.append(Turn(speaker=speaker, text=text))
    _enforce_window(session_id)


def get_turns(session_id: str) -> list[Turn]:
    return list(_buffers.get(session_id, []))


def format_turns(turns: list[Turn]) -> str:
    return "\n".join(f"{t.speaker}: {t.text}" for t in turns)


def clear_buffer(session_id: str):
    _buffers.pop(session_id, None)


def _enforce_window(session_id: str):
    turns = _buffers[session_id]
    while len(turns) > settings.transcript_turns:
        turns.pop(0)
