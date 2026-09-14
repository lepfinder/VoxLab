# Fun-ASR-Nano 与 Fun-CosyVoice3 接入说明

两个模型均来自阿里通义 FunAudioLLM，Apache-2.0，在 VoxLab 中作为**新增 Provider**，不替换现有 SenseVoice / Qwen3-TTS / VoxCPM。

## Fun-ASR-Nano-2512（ASR）

| 项 | 值 |
|---|---|
| API | `POST /api/v1/audio/transcriptions`，`model=fun_asr_nano` |
| 模型 | `FunAudioLLM/Fun-ASR-Nano-2512`（800M） |
| 依赖 | 已有 `funasr`（与 SenseVoice 相同） |
| 默认 hub | ModelScope（`FUN_ASR_HUB=ms`，含 CTC 时间戳权重） |

首次调用会自动下载权重。若 ModelScope 不可达，可设：

```bash
export FUN_ASR_HUB=hf
```

可选：若权重包内缺少 remote code，指向 Fun-ASR 仓库中的 `model.py`：

```bash
export FUN_ASR_REMOTE_CODE=/path/to/Fun-ASR/model.py
```

调用示例：

```bash
curl http://localhost:8001/api/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-local" \
  -F "file=@sample.wav" \
  -F "model=fun_asr_nano"
```

## Fun-CosyVoice3-0.5B（TTS）

| 项 | 值 |
|---|---|
| API | `POST /api/v1/audio/speech`，`model=fun_cosyvoice3` |
| 模型 | `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`（0.5B） |
| 依赖 | 本地 vendor 的 CosyVoice 仓库（含 submodule）+ 模型目录 |

### 1. 克隆 CosyVoice 仓库

```bash
# 在 VoxLab 仓库根目录执行
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git vendor/CosyVoice
cd vendor/CosyVoice
git submodule update --init --recursive
pip install -r requirements.txt
cd ../..
```

或自定义路径：

```bash
export COSYVOICE_ROOT=/path/to/CosyVoice
```

### 2. 下载模型

首次调用会尝试 ModelScope / HF 自动下载到 `vendor/pretrained_models/Fun-CosyVoice3-0.5B`。

也可手动：

```bash
python - <<'PY'
from modelscope import snapshot_download
snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512',
                  local_dir='vendor/pretrained_models/Fun-CosyVoice3-0.5B')
PY
```

自定义目录：`export COSYVOICE_MODEL_DIR=...`

### 3. 调用

**零样本克隆**（必须提供参考音频 + 完整参考文本）：

```bash
curl http://localhost:8001/api/v1/audio/speech \
  -H "Authorization: Bearer sk-local" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "fun_cosyvoice3",
    "input": "你好，这是 CosyVoice3 克隆测试。",
    "response_format": "wav",
    "ref_audio": "<base64 wav>",
    "ref_text": "参考音频对应的完整转写文本"
  }' --output out.wav
```

也可在管理后台给音色绑定 `tts_provider=fun_cosyvoice3` 与 `reference_audio`，通过 `/speech/speaker` 调用。

> **注意**：`ref_text` 必须覆盖参考音频全部内容，否则 zero-shot 可能崩坏（与 Qwen3-TTS 同类 ICL 问题）。

## 设备说明

- Fun-ASR-Nano：macOS 默认 CPU（funasr + LLM decoder 在 MPS 上不稳）；Linux 有 CUDA 时用 `cuda:0`
- CosyVoice3：默认 CPU；有 CUDA 时用 GPU。Apple Silicon 可跑但非实时优化路径

## 与现有模型的关系

```
ASR:  sensevoice / qwen / vosk  +  fun_asr_nano（新增）
TTS:  kokoro / qwen / voxcpm / omni / edge  +  fun_cosyvoice3（新增）
```
