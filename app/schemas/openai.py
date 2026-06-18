from pydantic import BaseModel, Field
from typing import List, Optional, Union, Dict, Any

# --- Audio Transcriptions (ASR) ---

class TranscriptionResponse(BaseModel):
    text: str
    language: Optional[str] = None
    duration: Optional[float] = None
    spk_embedding: Optional[List[float]] = None

# --- Audio Speech (TTS) ---

class SpeechRequest(BaseModel):
    model: str
    input: str
    voice: str = "alloy"
    response_format: Optional[str] = "mp3"
    speed: Optional[float] = 1.0
