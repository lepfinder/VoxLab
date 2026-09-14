import os
import logging
import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS, FUN_ASR_HUB, FUN_ASR_REMOTE_CODE, IS_MACOS

logger = logging.getLogger(__name__)


def _pick_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
        # funasr + LLM decoder 在 Apple Silicon 上优先 CPU，避免 MPS 算子缺口
    except Exception:
        pass
    return "cpu"


class FunASRNanoProvider(BaseProvider):
    """Fun-ASR-Nano-2512：SenseVoice 官方后继（800M，中英日 + 方言/口音/歌词）。"""

    def __init__(self):
        self.model_id = MODELS["fun_asr_nano"]

    def load(self):
        from funasr import AutoModel

        hub = (FUN_ASR_HUB or "ms").lower()
        device = _pick_device()
        logger.info(
            f"[FunASR-Nano] Loading {self.model_id} (hub={hub}, device={device})"
        )

        kwargs = {
            "model": self.model_id,
            "trust_remote_code": True,
            "disable_update": True,
            "hub": hub,
            "device": device,
        }
        # ModelScope checkpoint 自带 CTC 时间戳；HF 旧 artifact 可能缺 CTC
        if FUN_ASR_REMOTE_CODE and os.path.exists(FUN_ASR_REMOTE_CODE):
            kwargs["remote_code"] = FUN_ASR_REMOTE_CODE

        return AutoModel(**kwargs)

    def transcribe(
        self,
        audio_data: np.ndarray,
        language: str = "中文",
        hotwords: list | None = None,
        output_timestamp: bool = False,
    ) -> dict:
        model = model_manager.get_model(self.model_id, self.load)

        gen_kwargs = {
            "input": audio_data,
            "cache": {},
            "language": language or "中文",
            "itn": True,
            "batch_size_s": 60,
        }
        if hotwords:
            gen_kwargs["hotwords"] = hotwords

        res = model.generate(**gen_kwargs)
        if not res:
            return {
                "text": "",
                "language": "zh",
                "segments": None,
                "words": None,
            }

        item = res[0] if isinstance(res, (list, tuple)) else res
        text = (item.get("text") or "").strip()

        segments = None
        words = None
        if output_timestamp:
            segments, words = self._extract_timestamps(item)

        return {
            "text": text,
            "language": self._normalize_lang(language),
            "segments": segments,
            "words": words,
        }

    @staticmethod
    def _normalize_lang(language: str | None) -> str:
        if not language:
            return "zh"
        mapping = {
            "中文": "zh",
            "zh": "zh",
            "chinese": "zh",
            "英文": "en",
            "en": "en",
            "english": "en",
            "日文": "ja",
            "日语": "ja",
            "ja": "ja",
            "japanese": "ja",
        }
        return mapping.get(language.strip().lower(), "zh")

    @staticmethod
    def _extract_timestamps(item: dict) -> tuple[list | None, list | None]:
        """从 FunASR 结果中整理 segments / words；无时间戳时返回 (None, None)。"""
        sentence_info = item.get("sentence_info")
        if sentence_info:
            segments = []
            for i, sent in enumerate(sentence_info):
                start_ms = sent.get("start")
                end_ms = sent.get("end")
                seg_text = (sent.get("sentence") or sent.get("text") or "").strip()
                if start_ms is None or end_ms is None or not seg_text:
                    continue
                segments.append(
                    {
                        "id": i,
                        "seek": int(start_ms / 10),
                        "start": round(start_ms / 1000.0, 3),
                        "end": round(end_ms / 1000.0, 3),
                        "text": seg_text,
                    }
                )
            if segments:
                return segments, None

        raw_ts = item.get("timestamp")
        full_text = (item.get("text") or "").strip()
        if raw_ts and full_text:
            # 仅有整体 timestamp 列表、无对齐词表时，合成单 segment
            try:
                start_s = float(raw_ts[0][0]) / 1000.0
                end_s = float(raw_ts[-1][1]) / 1000.0
                return (
                    [
                        {
                            "id": 0,
                            "seek": int(start_s * 100),
                            "start": round(start_s, 3),
                            "end": round(end_s, 3),
                            "text": full_text,
                        }
                    ],
                    None,
                )
            except Exception:
                return None, None

        return None, None
