import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS

class KokoroProvider(BaseProvider):
    def __init__(self, lang_code: str = 'a'):
        self.lang_code = lang_code
        self.model_id = f"kokoro_{lang_code}" # 自定义缓存 ID

    def load(self):
        from kokoro import KPipeline
        print(f"Loading Kokoro KPipeline for lang_code '{self.lang_code}'...")
        return KPipeline(lang_code=self.lang_code)

    def generate(self, text: str, voice: str, speed: float = 1.0):
        pipeline = model_manager.get_model(self.model_id, self.load)
        generator = pipeline(text, voice=voice, speed=speed)
        
        audio_chunks = []
        for i, (gs, ps, audio) in enumerate(generator):
            if audio is not None:
                audio_chunks.append(audio)
        
        if not audio_chunks:
            return None
            
        return np.concatenate(audio_chunks)
