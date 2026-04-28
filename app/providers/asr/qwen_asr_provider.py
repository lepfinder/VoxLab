import os
import tempfile
import uuid
import subprocess
import logging
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS

logger = logging.getLogger(__name__)

class QwenASRProvider(BaseProvider):
    def __init__(self):
        self.model_id = MODELS["qwen_asr"]

    def load(self):
        from mlx_audio.stt.utils import load_model
        return load_model(self.model_id)

    def transcribe(self, audio_path: str):
        """
        QwenASR 通常接收文件路径
        """
        model = model_manager.get_model(self.model_id, self.load)
        from mlx_audio.stt.generate import generate_transcription
        
        temp_out = os.path.join(tempfile.gettempdir(), f"qwen_out_{uuid.uuid4()}.txt")
        try:
            transcription = generate_transcription(
                model=model,
                audio=audio_path,
                output_path=temp_out,
                format="txt",
                verbose=False
            )
            text = transcription.text if hasattr(transcription, 'text') else str(transcription)
            return text
        finally:
            if os.path.exists(temp_out): os.remove(temp_out)
