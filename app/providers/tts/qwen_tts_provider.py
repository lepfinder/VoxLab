import os
import tempfile
import uuid
import logging
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS

logger = logging.getLogger(__name__)

class QwenTTSProvider(BaseProvider):
    def __init__(self, mode: str = "design"):
        # mode: "design" (1.7B-VoiceDesign) or "custom" (1.7B-CustomVoice)
        self.mode = mode
        self.model_id = MODELS["qwen_tts_custom"] if mode == "custom" else MODELS["qwen_tts_design"]

    def load(self):
        from mlx_audio.tts.utils import load_model
        return load_model(self.model_id)

    def generate(self, text: str, voice: str = None, instruct: str = "A natural speech.", ref_audio: str = None, ref_text: str = None):
        model = model_manager.get_model(self.model_id, self.load)
        from mlx_audio.tts.generate import generate_audio
        
        file_prefix = os.path.join(tempfile.gettempdir(), f"qwen_tts_{uuid.uuid4()}")
        
        gen_kwargs = {
            "model": model,
            "text": text,
            "file_prefix": file_prefix,
            "join_audio": True,
            "instruct": instruct
        }
        
        if ref_audio:
            gen_kwargs["ref_audio"] = ref_audio
            gen_kwargs["ref_text"] = ref_text
        elif voice:
            gen_kwargs["voice"] = voice

        generate_audio(**gen_kwargs)
        
        out_file = file_prefix + ".wav"
        if os.path.exists(out_file):
            return out_file # 返回路径，由 Router 处理
        return None
