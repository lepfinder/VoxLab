import os
import subprocess
import tempfile
import uuid
import shutil
import datetime
import random
from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import FileResponse
import logging
from starlette.background import BackgroundTask

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/tts")
async def tts_handler(
    text: str = Form(...),
    voice: str = Form("zh-CN-XiaoxiaoNeural")
):
    from edge_tts import Communicate
    
    uid = uuid.uuid4()
    mp3_file = os.path.join(tempfile.gettempdir(), f"tts_{uid}.mp3")
    wav_file = os.path.join(tempfile.gettempdir(), f"tts_{uid}_16k.wav")

    try:
        # 1. Edge-TTS 生成 MP3 (24kHz)
        communicate = Communicate(text, voice)
        await communicate.save(mp3_file)

        # 2. ffmpeg 重采样：24kHz MP3 → 16kHz 单声道 PCM WAV
        #    使用 sinc 滤波，避免线性插值的混叠失真
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", mp3_file,
                "-ar", "16000",
                "-ac", "1",
                "-sample_fmt", "s16",
                wav_file,
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            err = result.stderr.decode(errors="replace")
            raise HTTPException(status_code=500, detail=f"ffmpeg error: {err}")

        logger.info(f"[EdgeTTS] Converted to 16kHz WAV: {wav_file}")

        # 保存副本供对比
        compare_dir = os.path.join("data", "output16k")
        os.makedirs(compare_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        random_num = random.randint(1000, 9999)
        shutil.copy2(wav_file, os.path.join(compare_dir, f"{timestamp}_{random_num}.wav"))

        def cleanup():
            for f in (mp3_file, wav_file):
                try:
                    os.remove(f)
                except OSError:
                    pass

        return FileResponse(
            wav_file,
            media_type="audio/wav",
            background=BackgroundTask(cleanup),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EdgeTTS] Unhandled Error: {str(e)}")
        for f in (mp3_file, wav_file):
            try:
                os.remove(f)
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")
