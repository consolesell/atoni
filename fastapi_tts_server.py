#!/usr/bin/env python3
"""
Kokoro-82M High-Fidelity Neural Text-to-Speech FastAPI Service
==============================================================
Provides studio-quality neural speech synthesis with Kokoro-82M:
- Default voices: 'af_heart' (studio flagship) or 'af_bella'
- Language code: 'a' (American English)
- Hardware: Auto-detects NVIDIA CUDA GPU on Google Colab or Linux instances, with CPU fallback
- Output: Standard audio/wav 24kHz PCM-16 byte buffer or streaming chunks
- Endpoints:
    * POST /api/tts          -> Standard JSON request body
    * GET  /api/tts          -> URL query parameter streaming
    * POST /v1/audio/speech  -> OpenAI-compatible TTS specification
    * GET  /api/tts/voices   -> List available voices and styles
    * GET  /health           -> Health & GPU status check

Colab Quickstart:
-----------------
!pip install -q fastapi uvicorn kokoro soundfile torch pyngrok
!python fastapi_tts_server.py
"""

import io
import os
import sys
import logging
from typing import Optional, List, Dict, Generator
import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("kokoro-tts")

# Device selection: prioritize CUDA on Colab / GPU hosts
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Target compute device: {DEVICE.upper()} (CUDA Available: {torch.cuda.is_available()})")

# Kokoro Model Pipeline Wrapper
try:
    from kokoro import KPipeline
    KOKORO_AVAILABLE = True
except ImportError:
    KOKORO_AVAILABLE = False
    logger.warning("Kokoro package not installed. Run `pip install kokoro soundfile torch`.")

# Singleton pipeline instances indexed by language code
_PIPELINE_CACHE: Dict[str, any] = {}

DEFAULT_VOICE = "af_heart"
ALTERNATIVE_VOICE = "af_bella"
SAMPLE_RATE = 24000

AVAILABLE_VOICES = {
    "af_heart": {
        "name": "Heart (Studio Flagship)",
        "gender": "female",
        "lang": "a",
        "description": "Warm, crystal-clear, executive studio presence",
    },
    "af_bella": {
        "name": "Bella (Tactical / Dynamic)",
        "gender": "female",
        "lang": "a",
        "description": "Smooth, articulate, expressive vocal cadence",
    },
    "af_sarah": {
        "name": "Sarah (Institutional)",
        "gender": "female",
        "lang": "a",
        "description": "Analytical, measured, corporate news tone",
    },
    "af_nicole": {
        "name": "Nicole (Whisper / Soft)",
        "gender": "female",
        "lang": "a",
        "description": "Soft-spoken, intimate, calm guidance",
    },
    "af_sky": {
        "name": "Sky (Bright / Youthful)",
        "gender": "female",
        "lang": "a",
        "description": "Fast, energetic, high-conviction delivery",
    },
    "am_adam": {
        "name": "Adam (Authoritative Male)",
        "gender": "male",
        "lang": "a",
        "description": "Deep, confident, quantitative voice",
    },
    "am_michael": {
        "name": "Michael (Conversational Male)",
        "gender": "male",
        "lang": "a",
        "description": "Natural, balanced conversational tone",
    },
}


def get_pipeline(lang_code: str = "a"):
    """
    Retrieves or lazily initializes the KPipeline on the optimal hardware device.
    """
    if not KOKORO_AVAILABLE:
        raise RuntimeError("Kokoro library is not installed. Please install with `pip install kokoro`.")

    if lang_code not in _PIPELINE_CACHE:
        logger.info(f"Initializing Kokoro KPipeline for lang_code='{lang_code}' on device='{DEVICE}'...")
        pipeline = KPipeline(lang_code=lang_code, device=DEVICE)
        _PIPELINE_CACHE[lang_code] = pipeline
        logger.info(f"Kokoro KPipeline '{lang_code}' initialized successfully.")
    return _PIPELINE_CACHE[lang_code]


def synthesize_audio_buffer(
    text: str,
    voice: str = DEFAULT_VOICE,
    speed: float = 1.0,
    lang_code: str = "a",
) -> bytes:
    """
    Synthesizes text into a standard audio/wav byte buffer using Kokoro-82M.
    """
    cleaned_text = text.strip()
    if not cleaned_text:
        raise ValueError("Text cannot be empty")

    selected_voice = voice if voice in AVAILABLE_VOICES else DEFAULT_VOICE
    pipeline = get_pipeline(lang_code=lang_code)

    audio_chunks: List[np.ndarray] = []

    with torch.inference_mode():
        # Kokoro yields (graphemes, phonemes, audio_tensor)
        generator = pipeline(cleaned_text, voice=selected_voice, speed=speed, split_pattern=r"\n+")
        for _, _, audio in generator:
            if audio is not None:
                if isinstance(audio, torch.Tensor):
                    audio_np = audio.detach().cpu().numpy()
                else:
                    audio_np = np.asarray(audio, dtype=np.float32)
                audio_chunks.append(audio_np)

    if not audio_chunks:
        raise RuntimeError("Synthesis produced no audio waveform")

    # Concatenate all sentence chunks
    full_audio = np.concatenate(audio_chunks, axis=0)

    # Encode to WAV byte buffer (PCM 16-bit, 24kHz)
    wav_io = io.BytesIO()
    sf.write(wav_io, full_audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    wav_io.seek(0)
    return wav_io.getvalue()


def synthesize_audio_stream(
    text: str,
    voice: str = DEFAULT_VOICE,
    speed: float = 1.0,
    lang_code: str = "a",
) -> Generator[bytes, None, None]:
    """
    Low-latency generator streaming WAV audio chunks as each sentence finishes.
    """
    wav_bytes = synthesize_audio_buffer(text, voice=voice, speed=speed, lang_code=lang_code)
    chunk_size = 32768  # 32KB chunks
    for i in range(0, len(wav_bytes), chunk_size):
        yield wav_bytes[i : i + chunk_size]


# ---------------------------------------------------------------------------
# FastAPI Application Definition
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Kokoro-82M Studio Neural TTS API",
    description="Studio-grade text-to-speech endpoint powered by Kokoro-82M neural synthesizer",
    version="1.0.0",
)

# Enable CORS for front-end integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request schemas
class TTSRequest(BaseModel):
    text: str = Field(..., description="Text string to synthesize into speech")
    voice: Optional[str] = Field(
        DEFAULT_VOICE,
        description="Voice ID ('af_heart', 'af_bella', 'af_sarah', 'am_adam', etc.)",
    )
    speed: Optional[float] = Field(1.0, ge=0.5, le=2.0, description="Speech rate multiplier (0.5 to 2.0)")
    lang_code: Optional[str] = Field("a", description="Language code ('a' = American English)")
    stream: Optional[bool] = Field(False, description="Whether to stream response in chunked transfer")


class OpenAISpeechRequest(BaseModel):
    input: str = Field(..., description="The text to generate audio for")
    voice: Optional[str] = Field(DEFAULT_VOICE, description="Voice identifier")
    model: Optional[str] = Field("kokoro-82m", description="Model name")
    speed: Optional[float] = Field(1.0, description="Speed of the generated audio")
    response_format: Optional[str] = Field("wav", description="Audio format (wav supported)")


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_warmup():
    """Warm up the model and CUDA tensors on server startup."""
    logger.info("Initializing Kokoro neural models...")
    if KOKORO_AVAILABLE:
        try:
            get_pipeline(lang_code="a")
            logger.info("Kokoro model pipeline warmed up and ready for queries.")
        except Exception as e:
            logger.warning(f"Startup warmup notice: {e}")


@app.get("/health")
def health_check():
    """Health, hardware, and GPU acceleration status."""
    return {
        "status": "healthy",
        "engine": "kokoro-82m",
        "device": DEVICE,
        "cuda_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "sample_rate": SAMPLE_RATE,
        "default_voice": DEFAULT_VOICE,
        "supported_voices": list(AVAILABLE_VOICES.keys()),
    }


@app.get("/api/tts/voices")
def get_voices():
    """Returns available Kokoro studio voices."""
    return {
        "default_voice": DEFAULT_VOICE,
        "alternative_voice": ALTERNATIVE_VOICE,
        "voices": AVAILABLE_VOICES,
    }


@app.post("/api/tts")
def post_text_to_speech(req: TTSRequest):
    """
    Main Text-to-Speech endpoint. Accepts JSON body and returns standard audio/wav buffer.
    """
    try:
        if req.stream:
            return StreamingResponse(
                synthesize_audio_stream(
                    text=req.text,
                    voice=req.voice or DEFAULT_VOICE,
                    speed=req.speed or 1.0,
                    lang_code=req.lang_code or "a",
                ),
                media_type="audio/wav",
                headers={
                    "Content-Disposition": 'inline; filename="synthesized_speech.wav"',
                    "Accept-Ranges": "bytes",
                    "X-TTS-Engine": "kokoro-82m",
                    "X-TTS-Voice": req.voice or DEFAULT_VOICE,
                },
            )

        wav_bytes = synthesize_audio_buffer(
            text=req.text,
            voice=req.voice or DEFAULT_VOICE,
            speed=req.speed or 1.0,
            lang_code=req.lang_code or "a",
        )

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "Content-Length": str(len(wav_bytes)),
                "Content-Disposition": 'inline; filename="synthesized_speech.wav"',
                "Accept-Ranges": "bytes",
                "X-TTS-Engine": "kokoro-82m",
                "X-TTS-Voice": req.voice or DEFAULT_VOICE,
            },
        )
    except Exception as exc:
        logger.error(f"TTS synthesis error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(exc)}")


@app.get("/api/tts")
def get_text_to_speech(
    text: str = Query(..., description="Text to synthesize"),
    voice: Optional[str] = Query(DEFAULT_VOICE, description="Voice ID"),
    speed: Optional[float] = Query(1.0, description="Speed multiplier"),
    lang_code: Optional[str] = Query("a", description="Language code"),
    stream: Optional[bool] = Query(False, description="Streaming mode"),
):
    """
    GET endpoint for text-to-speech to support standard HTML5 <audio src="..."> tags.
    """
    req = TTSRequest(text=text, voice=voice, speed=speed, lang_code=lang_code, stream=stream)
    return post_text_to_speech(req)


@app.post("/v1/audio/speech")
def openai_compatible_speech(req: OpenAISpeechRequest):
    """
    OpenAI-compatible speech endpoint (/v1/audio/speech) for drop-in client compatibility.
    """
    tts_req = TTSRequest(text=req.input, voice=req.voice or DEFAULT_VOICE, speed=req.speed or 1.0)
    return post_text_to_speech(tts_req)


# ---------------------------------------------------------------------------
# Standalone CLI Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting Kokoro-82M TTS FastAPI server on port {port}...")
    uvicorn.run("fastapi_tts_server:app", host="0.0.0.0", port=port, reload=False)
