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
            language="zh",
            use_itn=True,
            batch_size_s=60,
            merge_vad=True
        )
        
        if not res or len(res) == 0:
            return {"text": "", "spk_embedding": None}

        raw_text = res[0].get('text', '')
        text = re.sub(r'<\|.*?\|>', '', raw_text).strip()

        # 2. 提取声纹 (使用项目配置的 CAM++/ERes2NetV2 模型)
        spk_embedding = None
        try:
            from app.providers.voiceprint_provider import VoiceprintProvider
            import tempfile
            import soundfile as sf
            import os
            
            vp = VoiceprintProvider()
            # 为了复用 VoiceprintProvider 的补齐和异常处理逻辑，我们写一个临时文件
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                tmp_path = f.name
            try:
                sf.write(tmp_path, audio_data, 16000)
                spk_embedding = vp.extract(tmp_path)
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        except Exception as e:
            logger.error(f"Failed to extract spk_embedding during transcription: {e}")

        return {
            "text": text,
            "spk_embedding": spk_embedding
        }
