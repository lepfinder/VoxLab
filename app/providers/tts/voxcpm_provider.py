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
        # 通过镜像站下载模型到本地缓存，避免直连 huggingface.co
        local_path = snapshot_download(self.model_id, endpoint=HF_ENDPOINT)
        return VoxCPM.from_pretrained(local_path, load_denoiser=False)

    def generate(self, text: str, instruct: str = ""):
        model = model_manager.get_model(self.model_id, self.load)
        
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
