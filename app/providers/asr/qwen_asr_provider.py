import os
import tempfile
import uuid
import subprocess
import logging
import torch
import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS, IS_MACOS

logger = logging.getLogger(__name__)


def get_torch_device():
    """自动检测最佳设备：CUDA > MPS > CPU"""
    if torch.cuda.is_available():
        return "cuda:0"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class QwenASRProvider(BaseProvider):
    def __init__(self):
        self.model_id = MODELS["qwen_asr"]
        self.is_macos = IS_MACOS

    def load(self):
        if self.is_macos:
            # macOS: 使用 MLX 加速版
            from mlx_audio.stt.utils import load_model
            logger.info(f"[QwenASR] Loading MLX model: {self.model_id}")
            return load_model(self.model_id)
        else:
            # Linux: 使用 PyTorch 版
            from qwen_asr import Qwen3ASRModel
            device = get_torch_device()
            logger.info(f"[QwenASR] Loading PyTorch model: {self.model_id} on {device}")
            return Qwen3ASRModel.from_pretrained(
                self.model_id,
                dtype=torch.bfloat16,
                device_map=device,
            )

    def transcribe(self, audio_input):
        """
        语音识别接口
        :param audio_input: macOS 下为文件路径(str)，Linux 下可以是路径或 (numpy_array, sample_rate) 元组
        :return: 识别文本
        """
        model = model_manager.get_model(self.model_id, self.load)

        if self.is_macos:
            # macOS: MLX 推理
            from mlx_audio.stt.generate import generate_transcription

            temp_out = os.path.join(tempfile.gettempdir(), f"qwen_out_{uuid.uuid4()}.txt")
            try:
                transcription = generate_transcription(
                    model=model,
                    audio=audio_input,
                    output_path=temp_out,
                    format="txt",
                    verbose=False
                )
                text = transcription.text if hasattr(transcription, 'text') else str(transcription)
                return text
            finally:
                if os.path.exists(temp_out):
                    os.remove(temp_out)
        else:
            # Linux: PyTorch 推理
            try:
                results = model.transcribe(audio=audio_input)
                if results and len(results) > 0:
                    return results[0].text
                return ""
            except Exception as e:
                logger.error(f"[QwenASR] PyTorch transcription failed: {e}", exc_info=True)
                return ""
