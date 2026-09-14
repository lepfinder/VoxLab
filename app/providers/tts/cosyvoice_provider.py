import os
import sys
import uuid
import logging
import numpy as np
import soundfile as sf
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import (
    MODELS,
    COSYVOICE_ROOT,
    COSYVOICE_MODEL_DIR,
    HF_ENDPOINT,
    IS_MACOS,
)

logger = logging.getLogger(__name__)


def _pick_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
    except Exception:
        pass
    # CosyVoice 在 Apple Silicon 上走 CPU 更稳；MPS 需自行验证
    return "cpu"


class CosyVoiceProvider(BaseProvider):
    """Fun-CosyVoice3-0.5B：阿里通义 0.5B 流式/零样本克隆 TTS（Apache-2.0）。

    依赖本地 vendor 的 CosyVoice 仓库（含 submodule）与模型目录，见 README。
    """

    def __init__(self):
        self.model_id = MODELS["fun_cosyvoice3"]

    def _ensure_repo_on_path(self):
        if not os.path.isdir(COSYVOICE_ROOT):
            raise RuntimeError(
                f"CosyVoice repo not found at {COSYVOICE_ROOT}. "
                "Clone it first: git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git "
                f"{COSYVOICE_ROOT}  (or set COSYVOICE_ROOT)"
            )
        if COSYVOICE_ROOT not in sys.path:
            sys.path.insert(0, COSYVOICE_ROOT)

    def _resolve_model_dir(self) -> str:
        if os.path.isdir(COSYVOICE_MODEL_DIR):
            # 优先使用已有本地目录（需含 CosyVoice3 config/weights）
            if any(
                os.path.exists(os.path.join(COSYVOICE_MODEL_DIR, name))
                for name in ("llm.pt", "flow.pt", "hift.pt", "cosyvoice.yaml")
            ):
                return COSYVOICE_MODEL_DIR

        # 尝试从 ModelScope / HF 拉取
        try:
            from modelscope import snapshot_download as ms_download

            path = ms_download(self.model_id, local_dir=COSYVOICE_MODEL_DIR)
            logger.info(f"[CosyVoice3] Downloaded from ModelScope: {path}")
            return path
        except Exception as e:
            logger.warning(f"[CosyVoice3] ModelScope download failed: {e}")

        try:
            from huggingface_hub import snapshot_download as hf_download

            path = hf_download(
                self.model_id,
                local_dir=COSYVOICE_MODEL_DIR,
                endpoint=HF_ENDPOINT,
            )
            logger.info(f"[CosyVoice3] Downloaded from HuggingFace: {path}")
            return path
        except Exception as e:
            logger.warning(f"[CosyVoice3] HF download failed: {e}")

        if os.path.isdir(COSYVOICE_MODEL_DIR):
            return COSYVOICE_MODEL_DIR
        raise RuntimeError(
            f"Fun-CosyVoice3 model not found at {COSYVOICE_MODEL_DIR} and download failed."
        )

    def load(self):
        self._ensure_repo_on_path()
        from cosyvoice.cli.cosyvoice import CosyVoice

        model_dir = self._resolve_model_dir()
        device = _pick_device()
        logger.info(f"[CosyVoice3] Loading {model_dir} on {device}")

        # load_trt=False：macOS/Linux 通用；fp16 在 MPS 上易出音质问题，默认关闭
        try:
            return CosyVoice(
                model_dir,
                load_jit=False,
                load_trt=False,
                fp16=False,
                device=device,
            )
        except TypeError:
            # 旧版 CosyVoice 构造签名可能不含 device
            return CosyVoice(model_dir, load_jit=False, load_trt=False, fp16=False)

    def generate(
        self,
        text: str,
        instruct: str = "",
        ref_audio: str = None,
        ref_text: str = None,
        stream: bool = False,
    ) -> str | None:
        """合成语音，返回临时 wav 路径。有 ref_audio 走 zero-shot 克隆。"""
        if not text or not text.strip():
            return None

        model = model_manager.get_model(self.model_id, self.load)
        sample_rate = getattr(model, "sample_rate", 22050)

        chunks_iter = None
        if ref_audio:
            self._ensure_repo_on_path()
            from cosyvoice.utils.file_utils import load_wav

            prompt_speech = load_wav(ref_audio, 16000)
            prompt_text = (ref_text or "").strip()
            if not prompt_text:
                raise ValueError(
                    "CosyVoice3 zero-shot clone requires ref_text covering the full reference audio."
                )
            chunks_iter = model.inference_zero_shot(
                text, prompt_text, prompt_speech, stream=stream
            )
        elif instruct:
            # instruct2：文本指令（方言/情感/语速）；无参考音时用空 prompt 会失败，
            # 因此要求克隆音色或传入 ref_audio。若模型支持无 prompt 的 instruct，可后续放宽。
            self._ensure_repo_on_path()
            from cosyvoice.utils.file_utils import load_wav

            # 使用仓库自带示例 prompt 作为 fallback 音色
            fallback = self._find_builtin_prompt_wav()
            if not fallback:
                raise ValueError(
                    "instruct mode needs a prompt wav; pass ref_audio or place one under vendor/CosyVoice/asset"
                )
            prompt_speech = load_wav(fallback, 16000)
            chunks_iter = model.inference_instruct2(
                text, instruct, prompt_speech, stream=stream
            )
        else:
            # SFT 固定音色（若权重提供）；Fun-CosyVoice3 主打 zero-shot，SFT 可能不可用
            speaker = self._default_sft_speaker(model)
            if speaker is None:
                raise ValueError(
                    "No ref_audio/instruct provided and model has no SFT speakers. "
                    "Pass ref_audio+ref_text for zero-shot cloning."
                )
            chunks_iter = model.inference_sft(text, speaker, stream=stream)

        speech_parts = []
        for chunk in chunks_iter:
            audio = chunk.get("tts_speech") if isinstance(chunk, dict) else chunk
            if audio is None:
                continue
            if hasattr(audio, "numpy"):
                audio = audio.numpy()
            audio = np.asarray(audio).reshape(-1)
            speech_parts.append(audio.astype(np.float32))

        if not speech_parts:
            return None

        audio_np = np.concatenate(speech_parts)
        import tempfile

        out_path = os.path.join(
            tempfile.gettempdir(), f"cosyvoice3_{uuid.uuid4()}.wav"
        )
        sf.write(out_path, audio_np, sample_rate)
        return out_path

    @staticmethod
    def _default_sft_speaker(model) -> str | None:
        spks = getattr(model, "list_available_spks", None)
        if callable(spks):
            try:
                names = spks()
                if names:
                    return names[0]
            except Exception:
                return None
        return None

    @staticmethod
    def _find_builtin_prompt_wav() -> str | None:
        candidates = [
            os.path.join(COSYVOICE_ROOT, "asset", "zero_shot_prompt.wav"),
            os.path.join(COSYVOICE_ROOT, "asset", "cross_lingual_prompt.wav"),
        ]
        for p in candidates:
            if os.path.exists(p):
                return p
        return None
