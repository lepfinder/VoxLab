import os
import uuid
import logging
import numpy as np
import subprocess
import torch
import torchaudio
from fastapi import APIRouter, UploadFile, File
from modelscope.pipelines import pipeline
from modelscope.utils.constant import Tasks

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voiceprint")

# 全局缓存
sv_pipeline = None

from config import MODELS

def get_pipeline():
    global sv_pipeline
    if sv_pipeline is None:
        model_id = MODELS["voiceprint"]
        logger.info(f">>> STEP: Loading voiceprint model: {model_id}...")
        try:
            sv_pipeline = pipeline(
                task=Tasks.speaker_verification,
                model=model_id,
                model_revision='v1.0.2'
            )
            logger.info(">>> STEP: Model loaded. Pipeline type: %s", type(sv_pipeline))
        except Exception as e:
            logger.error(f">>> ERROR: Failed to load model: {e}")
            raise e
    return sv_pipeline

@router.post("/extract")
async def extract_voiceprint(file: UploadFile = File(...)):
    logger.info(">>> STEP: Received extraction request")
    temp_dir = os.path.join(os.getcwd(), "temp_audio")
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)
        
    temp_path = os.path.join(temp_dir, f"vp_{uuid.uuid4()}.wav")
    normalized_path = temp_path.replace(".wav", "_norm.wav")
    
    try:
        # 1. 保存上传文件
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)
            
        # 2. FFmpeg 预处理 (转为标准 16k WAV)
        cmd = ["ffmpeg", "-y", "-i", temp_path, "-ar", "16000", "-ac", "1", normalized_path]
        subprocess.run(cmd, check=True, capture_output=True)
        
        # 3. 绕过 Pipeline 的 __call__，直接用模型推理
        p = get_pipeline()
        
        # 加载音频为 Tensor
        wav, sr = torchaudio.load(normalized_path)
        if sr != 16000:
            resampler = torchaudio.transforms.Resample(sr, 16000)
            wav = resampler(wav)
        
        # 确保是单声道且形状正确 (C, T) -> (1, T)
        if wav.shape[0] > 1:
            wav = wav[0:1, :]
            
        logger.info(f">>> STEP: Audio Tensor ready, shape: {wav.shape}")

        # 尝试从不同的地方抓取模型对象
        model_obj = getattr(p, 'model', None) or getattr(p, '_model', None)
        
        if model_obj is not None:
            logger.info(">>> STEP: Direct model inference...")
            with torch.no_grad():
                # ERes2NetV2 的模型输入通常就是 wav tensor
                # 输出通常是 embedding tensor
                embedding_tensor = model_obj(wav)
                embedding = embedding_tensor.cpu().numpy()
        else:
            logger.warning(">>> WARNING: Could not find underlying model, falling back to pipeline call")
            # 最后的手段：用 pipeline
            result = p(normalized_path)
            res_dict = result[0] if isinstance(result, list) else result
            embedding = res_dict.get("spk_embedding") or res_dict.get("embedding")

        # 4. 结果转换
        if embedding is None:
            raise KeyError("Failed to extract embedding through both direct and pipeline methods")
            
        if isinstance(embedding, np.ndarray):
            embedding = embedding.flatten().tolist()
            
        logger.info(f">>> STEP: Success! Embedding length: {len(embedding)}")
        return {"embedding": embedding}
        
    except Exception as e:
        logger.error(f">>> ERROR in extract_voiceprint: {e}", exc_info=True)
        return {"error": str(e)}
    finally:
        for p_file in [temp_path, normalized_path]:
            if os.path.exists(p_file):
                os.remove(p_file)

@router.post("/compare")
async def compare_voiceprints(emb1: list, emb2: list):
    try:
        vec1 = np.array(emb1)
        vec2 = np.array(emb2)
        similarity = np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
        return {"similarity": float(similarity)}
    except Exception as e:
        return {"error": str(e)}
