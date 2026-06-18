import torch
import soundfile as sf
import os
import tempfile
import uuid
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS, HF_ENDPOINT

class OmniVoiceProvider(BaseProvider):
    def __init__(self):
        self.model_id = MODELS["omni_voice"]

    def load(self):
        from omnivoice import OmniVoice
        from huggingface_hub import snapshot_download
        # 通过镜像站下载模型到本地缓存，避免直连 huggingface.co
        local_path = snapshot_download(self.model_id, endpoint=HF_ENDPOINT)
        device = "mps" if torch.backends.mps.is_available() else ("cuda:0" if torch.cuda.is_available() else "cpu")
        return OmniVoice.from_pretrained(
            local_path,
            device_map=device,
            dtype=torch.float16 if device != "cpu" else torch.float32
        )

    def generate(self, text: str, instruct: str = "女，青年，中音调", ref_audio: str = None, ref_text: str = None):
        model = model_manager.get_model(self.model_id, self.load)
        
        kwargs = {"text": text, "instruct": instruct}
        if ref_audio: kwargs["ref_audio"] = ref_audio
        if ref_text: kwargs["ref_text"] = ref_text
            
        audio_chunks = model.generate(**kwargs)
        if not audio_chunks:
            return None
            
        temp_file = os.path.join(tempfile.gettempdir(), f"omni_{uuid.uuid4()}.wav")
        sf.write(temp_file, audio_chunks[0], getattr(model, 'sample_rate', 16000))
        return temp_file
