import os
import json
import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS, HF_HOME

class VoskProvider(BaseProvider):
    def __init__(self):
        self.model_name = MODELS["vosk"]
        # 兼容逻辑：优先找 HF 缓存，再找本地 models 目录
        self.model_path = os.path.join(HF_HOME, "hub", self.model_name)
        if not os.path.exists(self.model_path):
            local_alt = os.path.join("models", self.model_name)
            if os.path.exists(local_alt):
                self.model_path = local_alt

    def load(self):
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Vosk model not found at {self.model_path}")
        from vosk import Model
        return Model(self.model_path)

    def transcribe(self, audio_data: bytes):
        """
        Vosk 接收 bytes 格式的 PCM 数据
        """
        model = model_manager.get_model(self.model_name, self.load)
        from vosk import KaldiRecognizer
        
        rec = KaldiRecognizer(model, 16000)
        rec.AcceptWaveform(audio_data)
        
        result = json.loads(rec.FinalResult())
        text = result.get("text", "").replace(" ", "")
        return text
