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
        import logging
        import socket
        from urllib.parse import urlparse
        logger = logging.getLogger(__name__)

        # 1.5秒快速网络可用性探测，防止 Huggingface_hub 握手阻塞卡死
        host = urlparse(HF_ENDPOINT).hostname or "hf-mirror.com"
        online = False
        try:
            socket.create_connection((host, 443), timeout=1.5)
            online = True
        except Exception as e:
            logger.warning(f"[OmniVoice] Endpoint {host} unreachable: {e}")

        try:
            if not online:
                raise RuntimeError("Endpoint unreachable, fallback to local cache directly")
            local_path = snapshot_download(self.model_id, endpoint=HF_ENDPOINT)
        except Exception as e:
            logger.warning(f"[OmniVoice] Failed to check online model update: {e}. Trying local cache...")
            try:
                local_path = snapshot_download(self.model_id, endpoint=HF_ENDPOINT, local_files_only=True)
            except Exception as le:
                raise RuntimeError(f"Model {self.model_id} not found in local cache and remote download failed: {le}")

        device = "mps" if torch.backends.mps.is_available() else ("cuda:0" if torch.cuda.is_available() else "cpu")
        return OmniVoice.from_pretrained(
            local_path,
            device_map=device,
            dtype=torch.float16 if device != "cpu" else torch.float32
        )

    def generate(self, text: str, instruct: str = "女，青年，中音调", ref_audio: str = None, ref_text: str = None):
        model = model_manager.get_model(self.model_id, self.load)
        
        if ref_audio:
            # 声音克隆模式
            kwargs = {
                "text": text,
                "ref_audio": ref_audio
            }
            if ref_text:
                kwargs["ref_text"] = ref_text
        else:
            # 声音设计模式
            kwargs = {
                "text": text,
                "instruct": instruct
            }
            
        audio_chunks = model.generate(**kwargs)
        if not audio_chunks:
            return None
            
        temp_file = os.path.join(tempfile.gettempdir(), f"omni_{uuid.uuid4()}.wav")
        sf.write(temp_file, audio_chunks[0], getattr(model, 'sampling_rate', 24000))
        return temp_file
