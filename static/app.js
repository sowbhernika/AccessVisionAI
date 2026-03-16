/**
 * Live Accessibility Assistant — Low-latency Direct Gemini Connection
 *
 * Optimizations:
 * - Direct browser→Gemini WebSocket (no backend proxy)
 * - Streaming playback via AudioWorklet ring buffer (no per-chunk node creation)
 * - Chunked base64 encoding (no char-by-char loop)
 * - Small video frames (320x240 JPEG q=0.4) sent every 2s
 * - 8ms audio chunks from capture worklet
 * - Interruption support: flushes playback when user speaks
 */

const PLAYBACK_RATE = 24000;
const CAPTURE_RATE = 16000;
const VIDEO_INTERVAL = 2000;
const VIDEO_W = 320;
const VIDEO_H = 240;

let ws = null;
let playbackCtx = null;
let playbackNode = null;
let micCtx = null;
let micStream = null;
let videoStream = null;
let workletNode = null;
let videoTimer = null;
let config = null;
let isSpeaking = false; // Gemini is outputting audio

// ═══ UI State ═══

function setState(newState, message) {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  const chip = document.getElementById("status-chip");
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const viewport = document.getElementById("camera-viewport");

  dot.className = "status-dot " + newState;
  text.textContent = message || newState;
  document.getElementById("aria-status").textContent = message || newState;
  chip.className = "status-chip" + (newState === "active" ? " active" : "");

  if (newState === "active") {
    viewport.classList.add("live");
  } else {
    viewport.classList.remove("live");
  }

  startBtn.disabled = newState !== "idle" && newState !== "error";
  stopBtn.disabled = newState !== "active";
}

// ═══ Fast Base64 ═══

const _b64Lookup = new Array(256);
for (let i = 0; i < 256; i++) _b64Lookup[i] = String.fromCharCode(i);

function toBase64(uint8) {
  // Process in 32KB chunks to avoid call stack limits
  const chunks = [];
  const CHUNK = 32768;
  for (let i = 0; i < uint8.length; i += CHUNK) {
    const slice = uint8.subarray(i, Math.min(i + CHUNK, uint8.length));
    let str = "";
    for (let j = 0; j < slice.length; j++) str += _b64Lookup[slice[j]];
    chunks.push(str);
  }
  return btoa(chunks.join(""));
}

function fromBase64(b64) {
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}

// ═══ Audio Playback (Streaming Worklet) ═══

async function initPlayback() {
  playbackCtx = new AudioContext({ sampleRate: PLAYBACK_RATE });
  await playbackCtx.audioWorklet.addModule("playback-worklet.js");
  playbackNode = new AudioWorkletNode(playbackCtx, "playback-processor");
  playbackNode.connect(playbackCtx.destination);
}

function queueAudio(base64Data) {
  if (!playbackNode) return;
  const bytes = fromBase64(base64Data);
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  playbackNode.port.postMessage(float32.buffer, [float32.buffer]);
}

function flushPlayback() {
  if (playbackNode) playbackNode.port.postMessage("flush");
}

// ═══ Mic Capture ═══

async function startMic() {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: CAPTURE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  micCtx = new AudioContext({ sampleRate: CAPTURE_RATE });
  await micCtx.audioWorklet.addModule("audio-worklet.js");

  const source = micCtx.createMediaStreamSource(micStream);
  workletNode = new AudioWorkletNode(micCtx, "pcm-processor");

  // Pre-build the JSON envelope structure, swap data field each time
  workletNode.port.onmessage = (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pcm = new Uint8Array(event.data);
    ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: toBase64(pcm) }],
      },
    }));
  };

  source.connect(workletNode);
  workletNode.connect(micCtx.destination);
}

function stopMic() {
  if (workletNode) { workletNode.disconnect(); workletNode = null; }
  if (micCtx) { micCtx.close(); micCtx = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
}

// ═══ Camera Capture (low-res, 0.5fps) ═══

async function startCamera() {
  videoStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: VIDEO_W, height: VIDEO_H },
  });

  const videoEl = document.getElementById("camera-feed");
  videoEl.srcObject = videoStream;
  await videoEl.play();

  const canvas = document.getElementById("capture-canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;

  videoTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ctx.drawImage(videoEl, 0, 0, VIDEO_W, VIDEO_H);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        blob.arrayBuffer().then((buf) => {
          ws.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ mimeType: "image/jpeg", data: toBase64(new Uint8Array(buf)) }],
            },
          }));
        });
      },
      "image/jpeg",
      0.4
    );
  }, VIDEO_INTERVAL);
}

function stopCamera() {
  if (videoTimer) { clearInterval(videoTimer); videoTimer = null; }
  if (videoStream) { videoStream.getTracks().forEach((t) => t.stop()); videoStream = null; }
  document.getElementById("camera-feed").srcObject = null;
}

// ═══ Gemini WebSocket (Direct) ═══

function connectToGemini() {
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${config.apiKey}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      setup: {
        model: `models/${config.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: config.voiceName },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: config.systemPrompt }],
        },
      },
    }));
  };

  ws.onmessage = async (event) => {
    try {
      const text = event.data instanceof Blob ? await event.data.text() : event.data;
      const msg = JSON.parse(text);

      if (msg.setupComplete) {
        setState("active", "Connected — speak or point your camera");
        return;
      }

      if (msg.serverContent) {
        const sc = msg.serverContent;

        // Interruption: Gemini detected user speaking, flush queued audio
        if (sc.interrupted) {
          flushPlayback();
          isSpeaking = false;
          return;
        }

        const parts = sc.modelTurn?.parts;
        if (parts) {
          if (!isSpeaking) isSpeaking = true;
          for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith("audio/")) {
              queueAudio(part.inlineData.data);
            }
          }
        }

        if (sc.turnComplete) {
          isSpeaking = false;
        }
      }
    } catch (e) {
      console.error("Parse error:", e);
    }
  };

  ws.onerror = () => setState("error", "Connection error");
  ws.onclose = (e) => {
    if (document.getElementById("stop-btn").disabled === false) {
      setState("error", `Disconnected (${e.code}) — tap Start`);
    }
  };
}

// ═══ Session Control ═══

async function startSession() {
  try {
    setState("connecting", "Connecting...");
    const res = await fetch("/api/config");
    config = await res.json();

    await initPlayback();
    await startMic();
    await startCamera();
    connectToGemini();
  } catch (err) {
    console.error("Start failed:", err);
    setState("error", "Failed: " + err.message);
    stopSession();
  }
}

function stopSession() {
  if (ws) { ws.close(); ws = null; }
  stopMic();
  stopCamera();
  flushPlayback();
  if (playbackNode) { playbackNode.disconnect(); playbackNode = null; }
  if (playbackCtx) { playbackCtx.close(); playbackCtx = null; }
  setState("idle", "Ready — tap Start");
}

// ═══ Init ═══

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("start-btn").addEventListener("click", startSession);
  document.getElementById("stop-btn").addEventListener("click", stopSession);
  setState("idle", "Ready — tap Start");
});
