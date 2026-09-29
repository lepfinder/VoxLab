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
        audio_data,
        language: str = "中文",
        hotwords: list | None = None,
        output_timestamp: bool = False,
    ) -> dict:
        """audio_data 可为 16k float32 ndarray，或可读音频文件路径。"""
        model = model_manager.get_model(self.model_id, self.load)

        temp_path = None
        try:
            if isinstance(audio_data, (str, os.PathLike)):
                audio_input = str(audio_data)
            else:
                import soundfile as sf
                import tempfile

                arr = np.asarray(audio_data, dtype=np.float32).reshape(-1)
                fd, temp_path = tempfile.mkstemp(suffix=".wav")
                os.close(fd)
                sf.write(temp_path, arr, 16000)
                audio_input = temp_path

            gen_kwargs = {
                "input": [audio_input],
                "cache": {},
                "language": language or "中文",
                "itn": True,
                "batch_size_s": 60,
            }
            if hotwords:
                gen_kwargs["hotwords"] = hotwords

            res = model.generate(**gen_kwargs)
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

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
        """从 FunASR-Nano 结果整理 segments / words。

        优先使用 CTC 字级时间戳（秒），按标点/停顿聚合成句。
        """
        tokens = item.get("timestamps") or item.get("ctc_timestamps")
        full_text = (item.get("text") or "").strip()
        if not tokens:
            # 兜底：无字级时间戳时返回整段
            if full_text:
                return (
                    [{"id": 0, "seek": 0, "start": 0.0, "end": 0.0, "text": full_text}],
                    None,
                )
            return None, None

        words = []
        for t in tokens:
            token = str(t.get("token") or "").strip()
            if not token:
                continue
            start = t.get("start_time", t.get("start"))
            end = t.get("end_time", t.get("end"))
            if start is None or end is None:
                continue
            # funasr fun_asr_nano 的 start/end 已是秒
            words.append(
                {
                    "word": token,
                    "start": round(float(start), 3),
                    "end": round(float(end), 3),
                }
            )

        if not words:
            return None, None

        hard_break = set("。！？!?；;\n")
        soft_break = set("，,、")
        segments = []
        curr = []
        seg_start = None
        seg_end = None
        idx = 0

        for i, w in enumerate(words):
            if seg_start is None:
                seg_start = w["start"]
            seg_end = w["end"]
            curr.append(w)

            is_hard = any(p in w["word"] for p in hard_break)
            is_soft = any(p in w["word"] for p in soft_break) and len(curr) >= 8
            is_pause = False
            if i < len(words) - 1:
                gap = words[i + 1]["start"] - w["end"]
                if gap >= 0.8 and len(curr) >= 4:
                    is_pause = True

            if is_hard or is_soft or is_pause or i == len(words) - 1:
                text = "".join(c["word"] for c in curr).strip()
                if text:
                    segments.append(
                        {
                            "id": idx,
                            "seek": int(seg_start * 100),
                            "start": seg_start,
                            "end": seg_end,
                            "text": text,
                            "words": curr,
                        }
                    )
                    idx += 1
                curr = []
                seg_start = None
                seg_end = None

        return segments or None, words
