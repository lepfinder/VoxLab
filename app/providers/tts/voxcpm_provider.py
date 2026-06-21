import soundfile as sf
import os
import tempfile
import uuid
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS, HF_ENDPOINT

class VoxCPMProvider(BaseProvider):
    def __init__(self):
        self.model_id = MODELS["vox_cpm"]

    def load(self):
        from voxcpm import VoxCPM
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
            logger.warning(f"[VoxCPM] Endpoint {host} unreachable: {e}")

        try:
            if not online:
                raise RuntimeError("Endpoint unreachable, fallback to local cache directly")
            local_path = snapshot_download(self.model_id, endpoint=HF_ENDPOINT)
        except Exception as e:
            logger.warning(f"[VoxCPM] Failed to check online model update: {e}. Trying local cache...")
            try:
                local_path = snapshot_download(self.model_id, endpoint=HF_ENDPOINT, local_files_only=True)
            except Exception as le:
                raise RuntimeError(f"Model {self.model_id} not found in local cache and remote download failed: {le}")

        return VoxCPM.from_pretrained(local_path, load_denoiser=False)

    def generate(self, text: str, instruct: str = "", ref_audio: str = None, ref_text: str = None):
        model = model_manager.get_model(self.model_id, self.load)
        
        if ref_audio:
            # 声音克隆模式
            wav_audio = model.generate(
                text=text,
                prompt_wav_path=ref_audio,
                prompt_text=ref_text or "",
                reference_wav_path=ref_audio,
                cfg_value=2.0,
                inference_timesteps=10, 
            )
        else:
            # 声音设计模式
            final_text = f"({instruct}){text}" if instruct else text
            wav_audio = model.generate(
                text=final_text,
                cfg_value=2.0,
                inference_timesteps=10, 
            )
        
        if wav_audio is None:
            return None
            
        temp_file = os.path.join(tempfile.gettempdir(), f"voxcpm_{uuid.uuid4()}.wav")
        sf.write(temp_file, wav_audio, model.tts_model.sample_rate)
        return temp_file
