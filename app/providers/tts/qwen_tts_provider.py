import os
import tempfile
import uuid
import logging
import numpy as np
import torch
import librosa
import soundfile as sf
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


class QwenTTSProvider(BaseProvider):
    def __init__(self, mode: str = "design"):
        # mode: "design" (1.7B-VoiceDesign), "custom" (1.7B-CustomVoice), or "clone" (1.7B-Base)
        self.mode = mode
        if mode == "custom":
            self.model_id = MODELS["qwen_tts_custom"]
        elif mode == "clone":
            self.model_id = MODELS["qwen_tts_base"]
        else:
            self.model_id = MODELS["qwen_tts_design"]
        self.is_macos = IS_MACOS

    def load(self):
        if self.is_macos:
            # macOS: 使用 MLX 加速版
            from mlx_audio.tts.utils import load_model

            # 智能探测：如果本地缓存有该模型，直接使用本地路径加载，避开网络检查
            target_path = self.model_id
            try:
                # 转换 Repo ID 为 HF 缓存文件夹名格式
                folder_name = f"models--{self.model_id.replace('/', '--')}"
                hf_home = os.environ.get("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
                cache_dir = os.path.join(hf_home, "hub", folder_name, "snapshots")

                if os.path.exists(cache_dir):
                    snapshots = os.listdir(cache_dir)
                    if snapshots:
                        # 使用第一个（通常也是唯一一个）快照
                        target_path = os.path.join(cache_dir, snapshots[0])
                        logger.info(f"[QwenTTS] Local cache found, loading from: {target_path}")
            except Exception as e:
                logger.warning(f"[QwenTTS] Failed to detect local cache: {e}")

            logger.info(f"[QwenTTS] Loading MLX model from: {target_path}")
            return load_model(target_path)
        else:
            # Linux: 使用 PyTorch 版
            from qwen_tts import Qwen3TTSModel
            device = get_torch_device()
            logger.info(f"[QwenTTS] Loading PyTorch model: {self.model_id} on {device}")
            return Qwen3TTSModel.from_pretrained(
                self.model_id,
                device_map=device,
                dtype=torch.bfloat16,
            )

    def generate(self, text: str, voice: str = None, instruct: str = "A natural speech.", ref_audio: str = None, ref_text: str = None):
        model = model_manager.get_model(self.model_id, self.load)

        if self.is_macos:
            # macOS: MLX 推理
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
            else:
                gen_kwargs["voice"] = voice if voice and voice != "None" else "serena"

            generate_audio(**gen_kwargs)

            out_file = file_prefix + ".wav"
            if os.path.exists(out_file):
                return out_file
            return None
        else:
            # Linux: PyTorch 推理
            try:
                output_path = os.path.join(tempfile.gettempdir(), f"qwen_tts_{uuid.uuid4()}.wav")

                if ref_audio:
                    # 声音克隆模式（使用 Base 模型）
                    wavs, sr = model.generate_voice_clone(
                        text=text,
                        language="Chinese",
                        ref_audio=ref_audio,
                        ref_text=ref_text or "",
                    )
                elif self.mode == "custom":
                    # Custom Voice 模式
                    speaker = voice if voice and voice != "None" else "Serena"
                    wavs, sr = model.generate_custom_voice(
                        text=text,
                        language="Chinese",
                        speaker=speaker,
                        instruct=instruct or "A natural speech.",
                    )
                else:
                    # Voice Design 模式
                    wavs, sr = model.generate_voice_design(
                        text=text,
                        language="Chinese",
                        instruct=instruct or "A clear and natural speech.",
                    )

                if wavs and len(wavs) > 0:
                    # 合并音频片段并保存为 WAV
                    full_audio = np.concatenate(wavs)
                    sf.write(output_path, full_audio, sr)
                    logger.info(f"[QwenTTS] Generated audio saved to: {output_path}")
                    return output_path
                return None
            except Exception as e:
                logger.error(f"[QwenTTS] PyTorch generation failed: {e}", exc_info=True)
                return None

    def stream_generate(self, text: str, voice: str = None, instruct: str = "A cheerful young female voice with high pitch.", ref_audio: str = None, ref_text: str = None):
        try:
            model = model_manager.get_model(self.model_id, self.load)

            # 默认指令，针对 VoiceDesign 必须提供
            if not instruct:
                instruct = "A clear and natural speech."

            if self.is_macos:
                # macOS: MLX 流式推理
                gen_kwargs = {
                    "text": text,
                    "voice": voice if voice and voice != "None" else "serena",
                    "instruct": instruct,
                    "stream": True,
                    "streaming_interval": 1.0,
                }

                if ref_audio:
                    gen_kwargs["ref_audio"] = ref_audio
                    gen_kwargs["ref_text"] = ref_text

                logger.info(f"[QwenTTS] Generating stream (MLX) for: {text[:50]}... (Voice: {voice}, Instruct: {instruct})")

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

                    # 转换为 16-bit PCM (小端序)
                    audio_clipped = np.clip(audio_16k, -1.0, 1.0)
                    pcm_data = (audio_clipped * 32767).astype(np.int16).tobytes()
                    yield pcm_data
            else:
                # Linux: PyTorch 流式推理
                logger.info(f"[QwenTTS] Generating stream (PyTorch) for: {text[:50]}... (Voice: {voice}, Instruct: {instruct})")

                if ref_audio:
                    # 声音克隆流式
                    prompt = model.create_voice_clone_prompt(ref_audio=ref_audio, ref_text=ref_text or "")
                    stream_gen = model.stream_generate_voice_clone(
                        text=text,
                        language="Chinese",
                        voice_clone_prompt=prompt,
                    )
                elif self.mode == "custom":
                    # Custom Voice 流式（qwen-tts 暂无原生流式 API，用非流式模拟）
                    speaker = voice if voice and voice != "None" else "Serena"
                    wavs, sr = model.generate_custom_voice(
                        text=text,
                        language="Chinese",
                        speaker=speaker,
                        instruct=instruct,
                    )
                    stream_gen = [(np.concatenate(wavs), sr)] if wavs else []
                else:
                    # Voice Design 流式
                    stream_gen = model.stream_generate_voice_design(
                        text=text,
                        language="Chinese",
                        instruct=instruct,
                    )

                for chunk, sr in stream_gen:
                    # 重采样到 16000
                    if sr != 16000:
                        chunk_16k = librosa.resample(chunk, orig_sr=sr, target_sr=16000)
                    else:
                        chunk_16k = chunk

                    # 转换为 16-bit PCM
                    audio_clipped = np.clip(chunk_16k, -1.0, 1.0)
                    pcm_data = (audio_clipped * 32767).astype(np.int16).tobytes()
                    yield pcm_data

        except Exception as e:
            logger.error(f"[QwenTTS] Error during stream generation: {e}", exc_info=True)
            yield b""  # 至少返回点什么防止连接挂掉
