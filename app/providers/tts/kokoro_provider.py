import os
import numpy as np
from app.providers.base import BaseProvider
from app.core.model_manager import model_manager
from config import MODELS

# kokoro 支持的 lang_code 集合
# 参考: https://github.com/hexgrad/kokoro/blob/main/VOICES.md
VALID_LANG_CODES = {'a', 'b', 'j', 'z', 'e', 'f', 'h', 'i', 'p'}


def infer_lang_code(voice: str) -> str:
    """根据 voice ID 推断 kokoro 的 lang_code。

    voice ID 格式为 "{lang_prefix}{gender}_{name}"，例如:
    - af_heart -> 'a' (American English)
    - bf_emma  -> 'b' (British English)
    - jf_alpha -> 'j' (Japanese)
    - zm_yunxi -> 'z' (Mandarin Chinese)
    前缀第一个字符即为 lang_code。
    """
    if not voice or '_' not in voice:
        return 'a'
    lang_char = voice.split('_')[0][0]
    return lang_char if lang_char in VALID_LANG_CODES else 'a'


class KokoroProvider(BaseProvider):
    def __init__(self, lang_code: str = None, voice: str = None):
        # 优先从 voice ID 推断 lang_code，否则使用默认值 'a'
        if lang_code is not None:
            self.lang_code = lang_code
        elif voice is not None:
            self.lang_code = infer_lang_code(voice)
        else:
            self.lang_code = 'a'
        self.model_id = f"kokoro_{self.lang_code}" # 自定义缓存 ID

    def _find_local_dir(self) -> str:
        """寻找本地缓存的 Kokoro-82M 模型 snapshots 文件夹"""
        try:
            repo_id = "hexgrad/Kokoro-82M"
            folder_name = f"models--{repo_id.replace('/', '--')}"
            hf_home = os.environ.get("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
            cache_dir = os.path.join(hf_home, "hub", folder_name, "snapshots")
            if os.path.exists(cache_dir):
                snapshots = os.listdir(cache_dir)
                if snapshots:
                    # 使用最新/第一个快照路径
                    return os.path.join(cache_dir, snapshots[0])
        except Exception:
            pass
        return None

    def _load_pipeline(self, lang_code: str):
        from kokoro import KPipeline, KModel
        print(f"Loading Kokoro KPipeline for lang_code '{lang_code}'...")
        
        local_dir = self._find_local_dir()
        if local_dir:
            config_path = os.path.join(local_dir, "config.json")
            model_path = os.path.join(local_dir, "kokoro-v1_0.pth")
            if os.path.exists(config_path) and os.path.exists(model_path):
                print(f"[Kokoro] Found local cache at {local_dir}, initializing KModel offline.")
                # 显式使用本地模型与配置初始化
                kmodel = KModel(config=config_path, model=model_path)
                return KPipeline(lang_code=lang_code, model=kmodel)
                
        # 降级走默认远程拉取逻辑
        return KPipeline(lang_code=lang_code)

    def load(self):
        return self._load_pipeline(self.lang_code)

    def generate(self, text: str, voice: str, speed: float = 1.0):
        # 每次生成时根据 voice 动态推断 lang_code
        lang_code = infer_lang_code(voice)
        model_id = f"kokoro_{lang_code}"
        print(f"Generating with Kokoro KPipeline for lang_code '{lang_code}' and voice '{voice}'...")
        pipeline = model_manager.get_model(model_id, lambda: self._load_pipeline(lang_code))
        
        # 如果存在本地语音 pt 包，则直接使用绝对路径传递，避免触发 hf_hub_download 的网络 HEAD 请求
        voice_param = voice
        local_dir = self._find_local_dir()
        if local_dir:
            local_voice_path = os.path.join(local_dir, "voices", f"{voice}.pt")
            if os.path.exists(local_voice_path):
                voice_param = local_voice_path
                print(f"[Kokoro] Using local voice path: {voice_param}")
                
        generator = pipeline(text, voice=voice_param, speed=speed)
        
        audio_chunks = []
        for i, (gs, ps, audio) in enumerate(generator):
            if audio is not None:
                audio_chunks.append(audio)
        
        if not audio_chunks:
            return None
            
        return np.concatenate(audio_chunks)
