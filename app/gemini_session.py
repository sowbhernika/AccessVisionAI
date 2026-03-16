import asyncio
import logging
from google import genai
from google.genai import types
from app.config import GEMINI_API_KEY, MODEL_ID, VOICE_NAME, SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class GeminiLiveSession:
    def __init__(self):
        self._client = genai.Client(api_key=GEMINI_API_KEY)
        self._session = None
        self._ctx = None

    async def connect(self):
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=types.Content(
                parts=[types.Part(text=SYSTEM_PROMPT)]
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=VOICE_NAME
                    )
                )
            ),
        )
        self._ctx = self._client.aio.live.connect(
            model=MODEL_ID,
            config=config,
        )
        self._session = await self._ctx.__aenter__()
        logger.info("Gemini Live session connected")

    async def send_audio(self, pcm_data: bytes):
        if self._session:
            await self._session.send_realtime_input(
                audio=types.Blob(data=pcm_data, mime_type="audio/pcm;rate=16000")
            )

    async def send_video(self, jpeg_data: bytes):
        if self._session:
            await self._session.send_realtime_input(
                video=types.Blob(data=jpeg_data, mime_type="image/jpeg")
            )

    async def receive_responses(self):
        if not self._session:
            return
        async for response in self._session.receive():
            server_content = response.server_content
            if server_content is None:
                continue
            model_turn = server_content.model_turn
            if model_turn:
                for part in model_turn.parts:
                    if part.inline_data:
                        yield part.inline_data.data
            if server_content.turn_complete:
                yield None  # signal turn complete

    async def close(self):
        if self._ctx:
            try:
                await self._ctx.__aexit__(None, None, None)
            except Exception as e:
                logger.warning(f"Error closing Gemini session: {e}")
            finally:
                self._session = None
                self._ctx = None
            logger.info("Gemini Live session closed")
