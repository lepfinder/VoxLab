import os
import tempfile
import uuid
import numpy as np
import soundfile as sf
from fastapi import APIRouter, Form
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

router = APIRouter()

# 缓存 Kokoro Pipeline 以避免重复加载模型
kokoro_pipelines = {}

@router.post("/kokoro")
async def kokoro_handler(
    text: str = Form(...),
    voice: str = Form("af_heart"),
    speed: float = Form(1.0)
):
    from kokoro import KPipeline
    lang_code = voice[0] if voice else 'a'
    
    if lang_code not in kokoro_pipelines:
        try:
            print(f"Initializing Kokoro KPipeline for lang_code '{lang_code}'...")
            kokoro_pipelines[lang_code] = KPipeline(lang_code=lang_code)
        except Exception as e:
            return {"error": f"Failed to initialize Kokoro pipeline: {str(e)}"}
            
    pipeline = kokoro_pipelines[lang_code]
    generator = pipeline(text, voice=voice, speed=speed)
    
    audio_chunks = []
    for i, (gs, ps, audio) in enumerate(generator):
        if audio is not None:
            audio_chunks.append(audio)
            
    if not audio_chunks:
        return {"error": "No audio generated"}
        
    final_audio = np.concatenate(audio_chunks)
    temp_file = os.path.join(tempfile.gettempdir(), f"kokoro_{uuid.uuid4()}.wav")
    sf.write(temp_file, final_audio, 24000)
    
    # 同时保存一份到 data 目录
    import datetime
    import random
    import shutil
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    os.makedirs(data_dir, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    random_num = random.randint(1000, 9999)
    save_path = os.path.join(data_dir, f"{timestamp}_{random_num}.wav")
    shutil.copy(temp_file, save_path)
    print(f"[KokoroTTS] Saved audio copy to: {save_path}")
    
    return FileResponse(
        temp_file, 
        media_type="audio/wav", 
        background=BackgroundTask(os.remove, temp_file)
    )
