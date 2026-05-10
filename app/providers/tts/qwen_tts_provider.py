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
    def stream_generate(self, text: str, voice: str = None, instruct: str = "A cheerful young female voice with high pitch.", ref_audio: str = None, ref_text: str = None):
        try:
            model = model_manager.get_model(self.model_id, self.load)
            import numpy as np
            import librosa

            # 默认指令，针对 VoiceDesign 必须提供
            if not instruct:
                instruct = "A clear and natural speech."

            gen_kwargs = {
                "text": text,
                "voice": voice if voice else "af_bell",
                "instruct": instruct,
                "stream": True,
                "streaming_interval": 1.0, # 稍微拉大间隔，让模型推理更稳健
            }
            
            if ref_audio:
                gen_kwargs["ref_audio"] = ref_audio
                gen_kwargs["ref_text"] = ref_text

            logger.info(f"[QwenTTS] Generating stream for: {text[:50]}... (Voice: {voice}, Instruct: {instruct})")
            
            # 获取生成器
            results = model.generate(**gen_kwargs)
            
            for result in results:
                # result.audio 是 mlx array，转为 numpy
                audio_data = np.array(result.audio)
                
                # 如果采样率不是 16000，进行重采样
                if model.sample_rate != 16000:
                    audio_16k = librosa.resample(audio_data, orig_sr=model.sample_rate, target_sr=16000)
                else:
                    audio_16k = audio_data
                
                # 转换为 16-bit PCM (小端序)，必须先 clip 防止超过 [-1.0, 1.0] 导致溢出爆音
                audio_clipped = np.clip(audio_16k, -1.0, 1.0)
                pcm_data = (audio_clipped * 32767).astype(np.int16).tobytes()
                yield pcm_data
        except Exception as e:
            logger.error(f"[QwenTTS] Error during generation: {e}", exc_info=True)
            yield b"" # 至少返回点什么防止连接挂掉
