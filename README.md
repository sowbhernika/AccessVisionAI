# Live Accessibility Assistant

A real-time AI-powered accessibility assistant that helps visually impaired users navigate and understand their surroundings. Built with the Gemini Live API for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/).

## What it does

Point your phone or laptop camera at your surroundings and ask questions by speaking naturally. The assistant:

- **Describes scenes** in front of you in real time
- **Reads text** from signs, labels, menus, and documents aloud
- **Warns about hazards** (stairs, obstacles, vehicles) proactively
- **Answers spatial questions** like "What's to my left?"
- **Identifies colors and objects** for everyday assistance

All interaction happens through natural voice — no typing required.

## Architecture

```
[Mobile Browser]                [Cloud Run]                  [Gemini Live API]
  Camera (JPEG 1fps) ──→
  Mic (PCM 16kHz)    ──→   FastAPI /ws endpoint  ──→   gemini-2.0-flash-live
                            (WebSocket proxy)      ←──  Audio response (24kHz)
  Audio playback     ←──                                Vision + Audio understanding
  Accessible UI
```

## Tech Stack

- **Backend**: Python 3.11 + FastAPI + google-genai SDK
- **Frontend**: Vanilla HTML/JS/CSS (accessible, high-contrast UI)
- **Model**: Gemini 2.0 Flash Live (real-time multimodal)
- **Deployment**: Docker → Google Cloud Run

## Quick Start

### Prerequisites
- Python 3.11+
- A [Gemini API key](https://aistudio.google.com/apikey)

### Local Development

```bash
# Clone and enter
git clone https://github.com/YOUR_USERNAME/live-accessibility-assistant.git
cd live-accessibility-assistant

# Install dependencies
pip install -r requirements.txt

# Set your API key
export GEMINI_API_KEY=your-key-here

# Run
uvicorn app.main:app --port 8080
```

Open http://localhost:8080 in Chrome. Grant camera and microphone permissions. Tap **Start**.

> Note: `getUserMedia` requires HTTPS in production. Localhost is exempt.

### Deploy to Cloud Run

```bash
export GCP_PROJECT_ID=your-project-id
export GEMINI_API_KEY=your-key-here
chmod +x deploy.sh
./deploy.sh
```

## Project Structure

```
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # System prompt and model config
│   ├── gemini_session.py    # Gemini Live API session wrapper
│   └── websocket_handler.py # WebSocket proxy endpoint
├── static/
│   ├── index.html           # Accessible UI
│   ├── style.css            # High-contrast dark theme
│   ├── app.js               # WebSocket client, media capture, playback
│   └── audio-worklet.js     # PCM audio capture processor
├── Dockerfile
├── deploy.sh
└── requirements.txt
```

## Accessibility Features

- High-contrast dark theme (WCAG AA compliant)
- Large touch targets (56px+ buttons)
- Screen reader support (ARIA live regions)
- Keyboard navigable
- Respects `prefers-reduced-motion`

## Hackathon

Built for the **Gemini Live Agent Challenge** — Live Agents track.

- **Category**: Live Agents 🗣️
- **Model**: Gemini 2.0 Flash Live
- **SDK**: google-genai (Python)
- **Deployed on**: Google Cloud Run
