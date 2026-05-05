import re
import logging
import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS

logger = logging.getLogger(__name__)

class SenseVoiceProvider(BaseProvider):
    def __init__(self):
        self.model_id = MODELS["sensevoice"]

    def load(self):
        from funasr import AutoModel
        logger.info(f"Loading SenseVoice (ASR only)...")
        return AutoModel(
            model=self.model_id,
            trust_remote_code=True,
            disable_update=True
        )

    def transcribe(self, audio_data: np.ndarray):
        """执行 ASR 推理，并提取声纹特征"""
        model = model_manager.get_model(self.model_id, self.load)
        
        # 1. 识别文字
        res = model.generate(
            input=audio_data,
            cache={},
            language="auto",
            use_itn=True,
            batch_size_s=60,
            merge_vad=True
        )
        
        if not res or len(res) == 0:
            return {"text": "", "spk_embedding": None}

        raw_text = res[0].get('text', '')
        text = re.sub(r'<\|.*?\|>', '', raw_text).strip()

        # 2. 提取声纹 (使用项目配置的 ERes2NetV2 模型)
        spk_embedding = None
        try:
            from app.providers.voiceprint_provider import VoiceprintProvider
            vp = VoiceprintProvider()
            # 获取加载好的 pipeline
            p = model_manager.get_model(vp.model_id, vp.load)
            
            # 直接对 numpy 数组进行推理
            import torch
            # 确保数据是 float32 且在 [0, 1] 之间
            audio_tensor = torch.from_numpy(audio_data.astype(np.float32)).unsqueeze(0)
            
            # 尝试通过 pipeline 的模型直接提取
            model_obj = getattr(p, 'model', None) or getattr(p, '_model', None)
            if model_obj is not None:
                with torch.no_grad():
                    emb = model_obj(audio_tensor)
                    if hasattr(emb, "cpu"): emb = emb.cpu()
                    spk_embedding = np.array(emb).flatten().tolist()
            else:
                # 兜底：如果无法直接推理，说明 pipeline 结构较特殊
                logger.warning("Pipeline model not found, speaker matching might be skipped in chat")
        except Exception as e:
            logger.error(f"Failed to extract spk_embedding during transcription: {e}")

        return {
            "text": text,
            "spk_embedding": spk_embedding
        }
