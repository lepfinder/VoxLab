import re
import logging
import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS

logger = logging.getLogger(__name__)

def smart_join_words(words_list):
    text = ""
    for w in words_list:
        if not text:
            text = w
        elif re.match(r"^[a-zA-Z0-9]", w) and re.search(r"[a-zA-Z0-9]$", text):
            text += " " + w
        else:
            text += w
    return text


def parse_sensevoice_output(raw_text, raw_words=None, raw_timestamps=None):
    """从 SenseVoice 原生输出中解析语种、纯文本、分词时间戳与分句 segments"""
    lang_match = re.search(r"<\|([a-zA-Z]{2,3})\|>", raw_text or "")
    detected_lang = lang_match.group(1).lower() if lang_match else "zh"
    clean_text = re.sub(r"<\|.*?\|>", "", raw_text or "").strip()

    if not raw_words or not raw_timestamps or len(raw_words) != len(raw_timestamps):
        return clean_text, detected_lang, None, None

    words = []
    for w, ts in zip(raw_words, raw_timestamps):
        w_clean = re.sub(r"<\|.*?\|>", "", str(w)).strip()
        if not w_clean:
            continue
        start_s = round(float(ts[0]) / 1000.0, 3)
        end_s = round(float(ts[1]) / 1000.0, 3)
        words.append({"word": w_clean, "start": start_s, "end": end_s})

    if not words:
        return clean_text, detected_lang, [], []

    PUNCT_SPLIT = {"。", "！", "？", "!", "?", ";", "；", "\n"}
    PUNCT_SOFT = {"，", ",", "、"}

    segments = []
    curr_words = []
    seg_start = None
    seg_end = None
    idx = 0

    for i, item in enumerate(words):
        w = item["word"]
        start_s = item["start"]
        end_s = item["end"]

        if seg_start is None:
            seg_start = start_s
        seg_end = end_s
        curr_words.append(item)

        is_hard = any(p in w for p in PUNCT_SPLIT)
        is_soft = any(p in w for p in PUNCT_SOFT) and len(curr_words) >= 10
        is_pause = False
        if i < len(words) - 1:
            next_start = words[i + 1]["start"]
            if next_start - end_s >= 0.8 and len(curr_words) >= 4:
                is_pause = True

        if is_hard or is_soft or is_pause:
            seg_text = smart_join_words([cw["word"] for cw in curr_words]).strip()
            if seg_text:
                segments.append({
                    "id": idx,
                    "seek": int(seg_start * 100),
                    "start": seg_start,
                    "end": seg_end,
                    "text": seg_text,
                    "words": curr_words,
                })
                idx += 1
            curr_words = []
            seg_start = None
            seg_end = None

    if curr_words and seg_start is not None:
        seg_text = smart_join_words([cw["word"] for cw in curr_words]).strip()
        if seg_text:
            segments.append({
                "id": idx,
                "seek": int(seg_start * 100),
                "start": seg_start,
                "end": seg_end,
                "text": seg_text,
                "words": curr_words,
            })

    return clean_text, detected_lang, segments, words


class SenseVoiceProvider(BaseProvider):
    def __init__(self):
        self.model_id = MODELS["sensevoice"]

    def load(self):
        from funasr import AutoModel
        logger.info(f"Loading SenseVoice (ASR only)...")
        return AutoModel(
            model=self.model_id,
            trust_remote_code=True,
            disable_update=True
        )

    def transcribe(self, audio_data: np.ndarray, output_timestamp: bool = False):
        """执行 ASR 推理，并提取声纹特征与可选时间戳分段"""
        model = model_manager.get_model(self.model_id, self.load)
        
        # 1. 识别文字与可选时间戳
        gen_kwargs = {
            "input": audio_data,
            "cache": {},
            "language": "auto",
            "use_itn": True,
            "batch_size_s": 60,
        }
        if output_timestamp:
            gen_kwargs["output_timestamp"] = True

        res = model.generate(**gen_kwargs)
        
        if not res or len(res) == 0:
            return {
                "text": "",
                "language": "zh",
                "segments": [] if output_timestamp else None,
                "words": [] if output_timestamp else None,
                "spk_embedding": None
            }

        raw_text = res[0].get('text', '')
        raw_words = res[0].get('words', None) if output_timestamp else None
        raw_timestamps = res[0].get('timestamp', None) if output_timestamp else None

        text, detected_lang, segments, words = parse_sensevoice_output(
            raw_text, raw_words, raw_timestamps
        )

        # 2. 提取声纹 (使用项目配置的 CAM++/ERes2NetV2 模型)
        spk_embedding = None
        try:
            from app.providers.voiceprint_provider import VoiceprintProvider
            import tempfile
            import soundfile as sf
            import os
            
            vp = VoiceprintProvider()
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                tmp_path = f.name
            try:
                sf.write(tmp_path, audio_data, 16000)
                spk_embedding = vp.extract(tmp_path)
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        except Exception as e:
            logger.error(f"Failed to extract spk_embedding during transcription: {e}")

        return {
            "text": text,
            "language": detected_lang,
            "segments": segments,
            "words": words,
            "spk_embedding": spk_embedding
        }
