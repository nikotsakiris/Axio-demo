import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.transcript import add_turn, get_turns

router = APIRouter()


@router.websocket("/ws/transcript/{session_id}")
async def transcript_ws(ws: WebSocket, session_id: str):
    """manual transcript input via websocket for development and testing.
    send: {"speaker": "Party A", "text": "..."}
    recv: {"ok": true, "buffer_size": N, "turns": [...]}"""
    await ws.accept()

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)

            speaker = msg.get("speaker", "Unknown")
            text = msg.get("text", "")
            if not text.strip():
                await ws.send_json({"error": "empty text"})
                continue

            await add_turn(session_id, speaker, text)
            turns = await get_turns(session_id)

            await ws.send_json({
                "ok": True,
                "buffer_size": len(turns),
                "turns": [
                    {"speaker": t.speaker, "text": t.text, "timestamp": t.timestamp.isoformat()}
                    for t in turns
                ],
            })
    except WebSocketDisconnect:
        pass
    except Exception:
        await ws.close(code=1011)
