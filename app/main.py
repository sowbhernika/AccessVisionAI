import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from google import genai
from app.config import GEMINI_API_KEY, MODEL_ID, VOICE_NAME, SYSTEM_PROMPT

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Live Accessibility Assistant")
client = genai.Client(api_key=GEMINI_API_KEY)


@app.get("/api/config")
async def get_config():
    """Return session config for the browser to connect directly to Gemini."""
    return JSONResponse({
        "model": MODEL_ID,
        "apiKey": GEMINI_API_KEY,
        "voiceName": VOICE_NAME,
        "systemPrompt": SYSTEM_PROMPT,
    })


app.mount("/", StaticFiles(directory="static", html=True), name="static")
