import torch
import torchaudio
import numpy as np
import logging
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS

logger = logging.getLogger(__name__)

class VoiceprintProvider(BaseProvider):
    def __init__(self):
        self.model_id = MODELS["voiceprint"]

    def load(self):
        from modelscope.pipelines import pipeline
        from modelscope.utils.constant import Tasks
        logger.info(f"Loading Voiceprint model: {self.model_id}...")
        return pipeline(
            task=Tasks.speaker_verification,
            model=self.model_id,
            model_revision='v1.0.2'
        )

    def extract(self, audio_path: str):
        p = model_manager.get_model(self.model_id, self.load)
        
        # 加载音频
        wav, sr = torchaudio.load(audio_path)
        if sr != 16000:
            resampler = torchaudio.transforms.Resample(sr, 16000)
            wav = resampler(wav)
        if wav.shape[0] > 1:
            wav = wav[0:1, :]

        # 尝试直接模型推理
        model_obj = getattr(p, 'model', None) or getattr(p, '_model', None)
        if model_obj is not None:
            with torch.no_grad():
                embedding_tensor = model_obj(wav)
                embedding = embedding_tensor.cpu().numpy()
        else:
            result = p(audio_path)
            res_dict = result[0] if isinstance(result, list) else result
            embedding = res_dict.get("spk_embedding") or res_dict.get("embedding")

        if embedding is not None:
            return embedding.flatten().tolist()
        return None
