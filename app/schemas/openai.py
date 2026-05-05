from pydantic import BaseModel, Field
from typing import List, Optional, Union, Dict, Any

# --- Chat Completions ---

class ChatMessage(BaseModel):
    role: str
    content: str
    name: Optional[str] = None

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0
    n: Optional[int] = 1
    stream: Optional[bool] = False
    stop: Optional[Union[str, List[str]]] = None
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = 0.0
    frequency_penalty: Optional[float] = 0.0
    user: Optional[str] = None

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
