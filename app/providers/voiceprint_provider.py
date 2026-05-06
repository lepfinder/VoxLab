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
            model=self.model_id
        )

    def extract(self, audio_path: str):
        try:
            p = model_manager.get_model(self.model_id, self.load)
            
            # 加载音频
            wav, sr = torchaudio.load(audio_path)
            if sr != 16000:
                resampler = torchaudio.transforms.Resample(sr, 16000)
                wav = resampler(wav)
            if wav.shape[0] > 1:
                wav = wav[0:1, :]

            # 对于 CAM++ 或 ERes2Net，音频如果太短（例如 < 1.2s）可能会导致 500 错误
            # 如果音频太短，进行补零
            min_samples = int(1.2 * 16000)
            if wav.shape[1] < min_samples:
                padding = torch.zeros((1, min_samples - wav.shape[1]))
                wav = torch.cat([wav, padding], dim=1)

            # 尝试直接模型推理 (更稳健的方式)
            embedding = None
            model_obj = getattr(p, 'model', None) or getattr(p, '_model', None)
            
            if model_obj is not None:
                with torch.no_grad():
                    embedding_tensor = model_obj(wav)
                    if hasattr(embedding_tensor, "cpu"):
                        embedding = embedding_tensor.cpu().numpy()
            
            if embedding is None:
                # 兜底使用 pipeline
                result = p(audio_path)
                res_dict = result[0] if isinstance(result, list) else result
                # 适配不同模型的 key (spk_embedding 或 embedding)
                raw_emb = res_dict.get("spk_embedding") or res_dict.get("embedding")
                if hasattr(raw_emb, "numpy"):
                    embedding = raw_emb.numpy()
                else:
                    embedding = raw_emb

            if embedding is not None:
                return np.array(embedding).flatten().tolist()
            
            logger.error(f"Failed to get embedding from results: {p(audio_path)}")
            return None
        except Exception as e:
            logger.error(f"Voiceprint extraction fatal error: {e}", exc_info=True)
            return None
