import numpy as np
import torch
import logging
from app.providers.vad.base import BaseVADProvider
from app.core.model_manager import model_manager

logger = logging.getLogger(__name__)

class SileroVADProvider(BaseVADProvider):
    def __init__(self):
        self.model_id = "silero_vad"
        self.model = None
        self.get_speech_timestamps = None

    def load(self):
        # 延迟加载，防止启动时网络较慢卡顿
        if self.model is None:
            logger.info("Loading Silero VAD via PyTorch Hub...")
            try:
                # 强制使用 cpu，防止 mps/cuda 兼容性报错
                model, utils = torch.hub.load(
                    repo_or_dir='snakers4/silero-vad',
                    model='silero_vad',
                    trust_repo=True,
                    onnx=False
                )
                self.model = model.to("cpu")
                self.get_speech_timestamps = utils[0]
                logger.info("Silero VAD loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load Silero VAD: {e}")
                raise e

    def segments(self, audio_data: np.ndarray, sample_rate: int = 16000) -> list[dict]:
        # 确保加载
        self.load()
        if self.model is None or self.get_speech_timestamps is None:
            return []

        # 转换为 PyTorch tensor 并转移到 cpu
        audio_tensor = torch.from_numpy(audio_data).float().to("cpu")

        try:
            # 运行检测
            speech_timestamps = self.get_speech_timestamps(
                audio_tensor,
                self.model,
                sampling_rate=sample_rate,
                threshold=0.5,
                min_speech_duration_ms=250,
                min_silence_duration_ms=200
            )
            
            # 转换为秒
            segments = []
            for item in speech_timestamps:
                segments.append({
                    "start": round(item["start"] / sample_rate, 2),
                    "end": round(item["end"] / sample_rate, 2)
                })
            return segments
        except Exception as e:
            logger.error(f"Silero VAD execution failed: {e}")
            return []
