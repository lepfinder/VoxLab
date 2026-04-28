import re
import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS

class SenseVoiceProvider(BaseProvider):
    def __init__(self):
        self.model_id = MODELS["sensevoice"]

    def load(self):
        from funasr import AutoModel
        return AutoModel(model=self.model_id, trust_remote_code=True, disable_update=True)

    def transcribe(self, audio_data: np.ndarray):
        # 通过 ModelManager 获取加载好的模型
        model = model_manager.get_model(self.model_id, self.load)
        
        res = model.generate(
            input=audio_data, 
            cache={}, 
            language="auto", 
            use_itn=True, 
            batch_size_s=60, 
            merge_vad=True
        )
        
        if res and len(res) > 0:
            raw_text = res[0].get('text', '')
            text = re.sub(r'<\|.*?\|>', '', raw_text)
            return text
        return ""
