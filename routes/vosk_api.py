import os
import json
from fastapi import APIRouter, UploadFile, File

router = APIRouter()

from config import MODELS, HF_HOME

# 寻找模型路径：优先检查 HF 缓存目录，兼容旧的本地 models 目录
MODEL_NAME = MODELS["vosk"]
MODEL_PATH = os.path.join(HF_HOME, "hub", MODEL_NAME)

if not os.path.exists(MODEL_PATH):
    # 兼容原有的本地 models 目录
    local_alt = os.path.join("models", MODEL_NAME)
    if os.path.exists(local_alt):
        MODEL_PATH = local_alt

print(f"Loading Vosk model from: {MODEL_PATH}...")
if os.path.exists(MODEL_PATH):
    from vosk import Model
    model = Model(MODEL_PATH)
else:
    print(f"WARNING: Vosk model not found at {MODEL_PATH}. Please place it in {HF_HOME}/hub/")
    model = None

@router.post("/asr")
async def asr_handler(file: UploadFile = File(...)):
    if not model:
        return {"error": "Model not loaded", "text": ""}
    
    from vosk import KaldiRecognizer
    audio_data = await file.read()
    
    rec = KaldiRecognizer(model, 16000)
    rec.AcceptWaveform(audio_data)
    
    result = json.loads(rec.FinalResult())
    text = result.get("text", "").replace(" ", "")
    
    print(f"ASR (Vosk) Result: {text}")
    return {"text": text}
