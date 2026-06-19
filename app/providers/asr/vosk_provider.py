import os
import json
import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS, HF_HOME

class VoskProvider(BaseProvider):
    def __init__(self):
        self.model_name = MODELS["vosk"]
        # 兼容逻辑：优先找本地自定义 models/vosk-model 目录，再找标准的 local 路径与 HF 缓存
        self.model_path = os.path.join(HF_HOME, "hub", self.model_name)
        
        # 依次检查本地候选路径
        local_candidates = [
            os.path.join("models", "vosk-model"),
            os.path.join("models", self.model_name)
        ]
        for candidate in local_candidates:
            if os.path.exists(candidate):
                self.model_path = candidate
                break


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
