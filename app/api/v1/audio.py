import io
import uuid
import os
import tempfile
import subprocess
import soundfile as sf
import numpy as np
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response, Request
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.schemas.openai import TranscriptionResponse, SpeechRequest
from app.providers.asr.sensevoice_provider import SenseVoiceProvider
from app.providers.asr.vosk_provider import VoskProvider
from app.providers.asr.qwen_asr_provider import QwenASRProvider

from app.providers.tts.kokoro_provider import KokoroProvider
from app.providers.tts.edge_tts_provider import EdgeTTSProvider
from app.providers.tts.qwen_tts_provider import QwenTTSProvider
from app.providers.tts.omni_provider import OmniVoiceProvider
from app.providers.tts.voxcpm_provider import VoxCPMProvider

router = APIRouter(prefix="/v1/audio")

# 实例化提供者 (延迟加载保证了这里实例化不会占用大量内存)
sensevoice_provider = SenseVoiceProvider()
vosk_provider = VoskProvider()
qwen_asr_provider = QwenASRProvider()

edge_tts_provider = EdgeTTSProvider()
omni_provider = OmniVoiceProvider()
voxcpm_provider = VoxCPMProvider()
# Kokoro 和 QwenTTS 在请求时根据参数实例化（因为有多种模式/语言）

@router.post("/transcriptions", response_model=TranscriptionResponse)
async def transcriptions(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form("sensevoice")
):
    """
    OpenAI 兼容的 ASR 接口
    """
    request.state.model_name = model
    content = await file.read()
    
    # 根据模型需求准备数据
    model_key = model.lower()
    
    if "vosk" in model_key:
        text = vosk_provider.transcribe(content)
    elif "qwen" in model_key:
        # Qwen 需要文件路径，我们存一个临时文件
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            # 预处理 (16k 单声道)
            norm_path = tmp_path.replace(".wav", "_norm.wav")
            subprocess.run(["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", norm_path], check=True, capture_output=True)
            text = qwen_asr_provider.transcribe(norm_path)
            if os.path.exists(norm_path): os.remove(norm_path)
        finally:
            if os.path.exists(tmp_path): os.remove(tmp_path)
    else:
        # 默认使用 SenseVoice，它接收 numpy 数组
        try:
            with io.BytesIO(content) as audio_io:
                audio_array, _ = sf.read(audio_io)
        except Exception:
            audio_array = np.frombuffer(content, dtype=np.int16).astype(np.float32) / 32768.0
        text = sensevoice_provider.transcribe(audio_array)

    return TranscriptionResponse(text=text)

@router.post("/speech")
async def speech(request_body: SpeechRequest, request: Request):
    """
    OpenAI 兼容的 TTS 接口，支持多种本地和云端模型
    """
    request.state.model_name = request_body.model
    model_key = request_body.model.lower()
    output_path = None
    audio_bytes = None

    try:
        if "edge" in model_key:
            audio_bytes = await edge_tts_provider.generate(request_body.input, request_body.voice)
            
        elif "kokoro" in model_key:
            lang_code = request_body.voice[0] if request_body.voice else 'a'
            provider = KokoroProvider(lang_code=lang_code)
            audio_np = provider.generate(request_body.input, voice=request_body.voice, speed=request_body.speed)
            if audio_np is not None:
                output_path = os.path.join(tempfile.gettempdir(), f"kokoro_{uuid.uuid4()}.wav")
                sf.write(output_path, audio_np, 24000)
                
        elif "qwen" in model_key:
            # 简单判断模式
            mode = "custom" if request_body.voice and request_body.voice != "None" else "design"
            provider = QwenTTSProvider(mode=mode)
            output_path = provider.generate(request_body.input, voice=request_body.voice)
            
        elif "omni" in model_key:
            output_path = omni_provider.generate(request_body.input)
            
        elif "vox" in model_key:
            output_path = voxcpm_provider.generate(request_body.input)
            
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported TTS model: {request.model}")

        if not output_path and not audio_bytes:
            raise HTTPException(status_code=500, detail="Failed to generate audio")

        if audio_bytes:
            return Response(content=audio_bytes, media_type="audio/mpeg")

        return FileResponse(
            output_path, 
            media_type="audio/wav", 
            background=BackgroundTask(os.remove, output_path)
        )
    except Exception as e:
        if output_path and os.path.exists(output_path): os.remove(output_path)
        raise HTTPException(status_code=500, detail=str(e))
