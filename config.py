import os
import platform

# 平台检测：macOS 用 MLX 加速，Linux 用 PyTorch
IS_MACOS = platform.system() == "Darwin"

# 模型配置中心
# 所有模型 ID 均对应 Hugging Face 上的 Repository ID
MODELS = {
    # ASR 模型
    "vosk": "vosk-model-small-cn-0.22", # 本地兼容处理
    "sensevoice": "iic/SenseVoiceSmall",
    "qwen_asr": "mlx-community/Qwen3-ASR-0.6B-4bit" if IS_MACOS else "Qwen/Qwen3-ASR-0.6B",
    # Fun-ASR-Nano：SenseVoice 官方后继（800M，方言/口音/歌词）。默认走 ModelScope 以获取 CTC 时间戳
    "fun_asr_nano": "FunAudioLLM/Fun-ASR-Nano-2512",

    # TTS 模型
    "kokoro": "hexgrad/Kokoro-82M",
    "qwen_tts_design": "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit" if IS_MACOS else "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "qwen_tts_custom": "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit" if IS_MACOS else "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    "qwen_tts_base": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit" if IS_MACOS else "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    "omni_voice": "k2-fsa/OmniVoice",
    "vox_cpm": "openbmb/VoxCPM2",
    # Fun-CosyVoice3：0.5B 轻量流式克隆，Apache-2.0。需 vendor CosyVoice 仓库
    "fun_cosyvoice3": "FunAudioLLM/Fun-CosyVoice3-0.5B-2512",

    # 声纹模型
    "voiceprint": "iic/speech_campplus_sv_zh-cn_16k-common",
}

# 缓存目录配置
HF_HOME = os.getenv("HF_HOME", os.path.expanduser("~/.cache/huggingface"))

# 镜像站配置 (如果需要使用镜像站，请修改此项)
# 例如使用 hf-mirror: https://hf-mirror.com
HF_ENDPOINT = os.getenv("HF_ENDPOINT", "https://hf-mirror.com")

# 运行时数据目录：锚定仓库根，不随 cwd 漂移；可用 VOXLAB_DATA_DIR 覆盖
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(
    os.getenv("VOXLAB_DATA_DIR") or os.path.join(PROJECT_ROOT, "data")
)
DB_PATH = os.path.join(DATA_DIR, "server.db")
CLONED_VOICES_DIR = os.path.join(DATA_DIR, "cloned_voices")

# Fun-ASR-Nano 推理配置
# hub: ms=ModelScope（含 CTC 时间戳权重），hf=HuggingFace（时间戳可能缺失）
FUN_ASR_HUB = os.getenv("FUN_ASR_HUB", "ms")
# 可选：指向 Fun-ASR 仓库中的 model.py（若权重包内未内置 remote code）
FUN_ASR_REMOTE_CODE = os.getenv("FUN_ASR_REMOTE_CODE", "")

# CosyVoice 推理配置：本地克隆的 CosyVoice 仓库与模型目录
COSYVOICE_ROOT = os.path.abspath(
    os.getenv("COSYVOICE_ROOT") or os.path.join(PROJECT_ROOT, "vendor", "CosyVoice")
)
COSYVOICE_MODEL_DIR = os.path.abspath(
    os.getenv("COSYVOICE_MODEL_DIR")
    or os.path.join(PROJECT_ROOT, "vendor", "pretrained_models", "Fun-CosyVoice3-0.5B")
)
