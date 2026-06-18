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

    # TTS 模型
    "kokoro": "hexgrad/Kokoro-82M",
    "qwen_tts_design": "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit" if IS_MACOS else "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "qwen_tts_custom": "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit" if IS_MACOS else "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    "omni_voice": "k2-fsa/OmniVoice",
    "vox_cpm": "openbmb/VoxCPM2",

    # 声纹模型
    "voiceprint": "iic/speech_campplus_sv_zh-cn_16k-common",
}

# 缓存目录配置
HF_HOME = os.getenv("HF_HOME", os.path.expanduser("~/.cache/huggingface"))

# 镜像站配置 (如果需要使用镜像站，请修改此项)
# 例如使用 hf-mirror: https://hf-mirror.com
HF_ENDPOINT = os.getenv("HF_ENDPOINT", "https://hf-mirror.com") 
