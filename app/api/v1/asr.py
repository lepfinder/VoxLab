"""
ASR（语音识别）相关 HTTP 接口
- POST /api/v1/audio/transcriptions  文件转录
- POST /api/v1/audio/vad             语音活动检测
"""
import os
import uuid
import tempfile
import time
import logging
import numpy as np
import soundfile as sf
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from app.schemas.openai import TranscriptionResponse
from app.providers.asr.sensevoice_provider import SenseVoiceProvider
from app.providers.asr.vosk_provider import VoskProvider
from app.providers.asr.qwen_asr_provider import QwenASRProvider
from app.providers.vad.energy_vad import EnergyVADProvider
from app.providers.vad.webrtc_vad import WebRTCVADProvider
from app.providers.vad.silero_vad import SileroVADProvider

router = APIRouter(prefix="/api/v1/audio")
logger = logging.getLogger(__name__)

# 实例化 ASR / VAD 提供者
sensevoice_provider = SenseVoiceProvider()
vosk_provider = VoskProvider()
qwen_asr_provider = QwenASRProvider()

energy_vad_provider = EnergyVADProvider()
webrtc_vad_provider = WebRTCVADProvider()
silero_vad_provider = SileroVADProvider()


@router.post("/transcriptions")
async def transcribe(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form("sensevoice")
):
    request.state.model_name = model
    logger.info(f"[ASR] Request received. File: {file.filename}, Content-Type: {file.content_type}, Model: {model}")

    temp_path = None
    try:
        # 保存到临时文件
        suffix = os.path.splitext(file.filename)[1] if file.filename else ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_path = tmp.name

        model_key = model.lower()
        text = ""

        if "sensevoice" in model_key:
            import librosa
            data, sr = librosa.load(temp_path, sr=16000)
            result = sensevoice_provider.transcribe(data)
            text = result.get("text", "")
        elif "vosk" in model_key:
            import librosa
            data, sr = librosa.load(temp_path, sr=16000)
            pcm_bytes = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
            text = vosk_provider.transcribe(pcm_bytes)
        elif "qwen" in model_key:
            text = qwen_asr_provider.transcribe(temp_path)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported ASR model: {model}")

        logger.info(f"[ASR] Transcription result: {text}")
        resp = TranscriptionResponse(text=text)
        return JSONResponse(
            content=resp.model_dump(),
            headers={"X-Model-Name": model},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ASR] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass


@router.post("/vad")
async def voice_activity_detection(
    request: Request,
    file: UploadFile = File(...),
    engine: str = Form("silero"),
    threshold: float = Form(0.02),
    sensitivity: int = Form(2)
):
    request.state.model_name = f"vad_{engine}"
    logger.info(f"[VAD] Request received. File: {file.filename}, Engine: {engine}")

    temp_path = None
    start_time = time.time()
    try:
        # 在本地创建音频保存目录
        save_dir = "temp_audio"
        os.makedirs(save_dir, exist_ok=True)

        orig_ext = os.path.splitext(file.filename)[1] if file.filename else ".webm"
        filename = f"vad_{int(time.time())}_{uuid.uuid4().hex[:8]}{orig_ext}"
        temp_path = os.path.join(save_dir, filename)

        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)

        import librosa
        data, sr = librosa.load(temp_path, sr=16000)

        # 如果原本不是 wav，转换为标准 wav 方便本地调试
        if orig_ext.lower() != ".wav":
            wav_path = os.path.splitext(temp_path)[0] + ".wav"
            sf.write(wav_path, data, 16000)
            logger.info(f"[VAD] Transcoded source file to wav: {wav_path}")

        engine_key = engine.lower()
        if "energy" in engine_key:
            provider = EnergyVADProvider(threshold=threshold)
            segments = provider.segments(data, sample_rate=16000)
        elif "webrtc" in engine_key:
            provider = WebRTCVADProvider(mode=sensitivity)
            segments = provider.segments(data, sample_rate=16000)
        elif "silero" in engine_key:
            segments = silero_vad_provider.segments(data, sample_rate=16000)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported VAD engine: {engine}")

        duration = time.time() - start_time
        return {
            "engine": engine,
            "segments": segments,
            "process_time_ms": round(duration * 1000, 2)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[VAD] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # 正常请求保留 temp_audio 文件供调试，不主动删除
        pass
