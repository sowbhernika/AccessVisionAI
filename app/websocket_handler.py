import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.gemini_session import GeminiLiveSession

logger = logging.getLogger(__name__)
router = APIRouter()

MSG_TYPE_AUDIO = 0x00
MSG_TYPE_VIDEO = 0x01


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = GeminiLiveSession()
    logger.info("WebSocket client connected")

    try:
        await session.connect()

        async def forward_to_gemini():
            """Receive audio/video from browser, forward to Gemini."""
            try:
                while True:
                    data = await websocket.receive_bytes()
                    if len(data) < 2:
                        continue
                    msg_type = data[0]
                    payload = data[1:]
                    if msg_type == MSG_TYPE_AUDIO:
                        await session.send_audio(payload)
                    elif msg_type == MSG_TYPE_VIDEO:
                        await session.send_video(payload)
            except WebSocketDisconnect:
                logger.info("Browser disconnected")
            except Exception as e:
                logger.error(f"Error forwarding to Gemini: {e}")

        async def forward_from_gemini():
            """Receive audio from Gemini, forward to browser."""
            try:
                async for audio_chunk in session.receive_responses():
                    if audio_chunk is None:
                        # Turn complete signal
                        await websocket.send_text(
                            json.dumps({"type": "turn_complete"})
                        )
                    else:
                        # Audio data - prefix with type byte
                        await websocket.send_bytes(
                            bytes([MSG_TYPE_AUDIO]) + audio_chunk
                        )
            except WebSocketDisconnect:
                logger.info("Browser disconnected during receive")
            except Exception as e:
                logger.error(f"Error forwarding from Gemini: {e}")

        await asyncio.gather(forward_to_gemini(), forward_from_gemini())

    except Exception as e:
        logger.error(f"Session error: {e}")
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": str(e)})
            )
        except Exception:
            pass
    finally:
        await session.close()
        logger.info("Session cleaned up")
