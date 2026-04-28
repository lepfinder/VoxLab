import io
import re
import numpy as np
from fastapi import APIRouter, UploadFile, File

router = APIRouter()

from config import MODELS
try:
    from funasr import AutoModel
    model_id = MODELS["sensevoice"]
    print(f"Loading SenseVoice model: {model_id}...")
    # FunASR 默认可能会查 ModelScope，如果已经下载到 HF 也可以直接加载
    sense_model = AutoModel(model=model_id, trust_remote_code=True, disable_update=True)
except Exception as e:
    print(f"WARNING: Failed to load SenseVoice model: {e}")
    sense_model = None

@router.post("/funasr")
async def funasr_handler(file: UploadFile = File(...)):
    if not sense_model:
        return {"error": "SenseVoice model not loaded", "text": ""}
        
    audio_data = await file.read()
    
    try:
        import soundfile as sf
        with io.BytesIO(audio_data) as audio_io:
            audio_array, sample_rate = sf.read(audio_io)
    except Exception:
        audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

    res = sense_model.generate(
        input=audio_array, 
        cache={}, 
        language="auto", 
        use_itn=True, 
        batch_size_s=60, 
        merge_vad=True
    )
    
    if res and len(res) > 0:
        raw_text = res[0].get('text', '')
        text = re.sub(r'<\|.*?\|>', '', raw_text)
        print(f"ASR (SenseVoice) Result: {text}")
        return {"text": text}
    
    return {"text": ""}
