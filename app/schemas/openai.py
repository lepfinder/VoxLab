from pydantic import BaseModel, Field
from typing import List, Optional, Union, Dict, Any

# --- Audio Transcriptions (ASR) ---

class TranscriptionWord(BaseModel):
    word: str
    start: float
    end: float

class TranscriptionSegment(BaseModel):
    id: int
    seek: int = 0
    start: float
    end: float
    text: str
    tokens: Optional[List[int]] = None
    temperature: Optional[float] = 0.0
    avg_logprob: Optional[float] = 0.0
    compression_ratio: Optional[float] = 1.0
    no_speech_prob: Optional[float] = 0.0
    words: Optional[List[TranscriptionWord]] = None

class TranscriptionResponse(BaseModel):
    text: str
    task: Optional[str] = None
    language: Optional[str] = None
    duration: Optional[float] = None
    segments: Optional[List[TranscriptionSegment]] = None
    words: Optional[List[TranscriptionWord]] = None
    spk_embedding: Optional[List[float]] = None

# --- Audio Speech (TTS) ---

class SpeechRequest(BaseModel):
    model: str
    input: str
    voice: str = "alloy"
    response_format: Optional[str] = "mp3"
    speed: Optional[float] = 1.0
    instruct: Optional[str] = None
    ref_audio: Optional[str] = None
    ref_text: Optional[str] = None
    cache: Optional[bool] = False
