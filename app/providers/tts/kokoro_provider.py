import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS

# kokoro 支持的 lang_code 集合
# 参考: https://github.com/hexgrad/kokoro/blob/main/VOICES.md
VALID_LANG_CODES = {'a', 'b', 'j', 'z', 'e', 'f', 'h', 'i', 'p'}


def infer_lang_code(voice: str) -> str:
    """根据 voice ID 推断 kokoro 的 lang_code。

    voice ID 格式为 "{lang_prefix}{gender}_{name}"，例如:
    - af_heart -> 'a' (American English)
    - bf_emma  -> 'b' (British English)
    - jf_alpha -> 'j' (Japanese)
    - zm_yunxi -> 'z' (Mandarin Chinese)
    前缀第一个字符即为 lang_code。
    """
    if not voice or '_' not in voice:
        return 'a'
    lang_char = voice.split('_')[0][0]
    return lang_char if lang_char in VALID_LANG_CODES else 'a'


class KokoroProvider(BaseProvider):
    def __init__(self, lang_code: str = None, voice: str = None):
        # 优先从 voice ID 推断 lang_code，否则使用默认值 'a'
        if lang_code is not None:
            self.lang_code = lang_code
        elif voice is not None:
            self.lang_code = infer_lang_code(voice)
        else:
            self.lang_code = 'a'
        self.model_id = f"kokoro_{self.lang_code}" # 自定义缓存 ID

    def load(self):
        from kokoro import KPipeline
        print(f"Loading Kokoro KPipeline for lang_code '{self.lang_code}'...")
        return KPipeline(lang_code=self.lang_code)

    def generate(self, text: str, voice: str, speed: float = 1.0):
        # 每次生成时根据 voice 动态推断 lang_code
        lang_code = infer_lang_code(voice)
        model_id = f"kokoro_{lang_code}"
        print(f"Generating with Kokoro KPipeline for lang_code '{lang_code}' and voice '{voice}'...")
        pipeline = model_manager.get_model(model_id, lambda: self._load_pipeline(lang_code))
        generator = pipeline(text, voice=voice, speed=speed)
        
        audio_chunks = []
        for i, (gs, ps, audio) in enumerate(generator):
            if audio is not None:
                audio_chunks.append(audio)
        
        if not audio_chunks:
            return None
            
        return np.concatenate(audio_chunks)

    def _load_pipeline(self, lang_code: str):
        from kokoro import KPipeline
        print(f"Loading Kokoro KPipeline for lang_code '{lang_code}'...")
        return KPipeline(lang_code=lang_code)
