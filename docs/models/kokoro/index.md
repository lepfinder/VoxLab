# Kokoro

## 简介

Kokoro 是一个轻量级高质量语音合成模型，由 [hexgrad](https://github.com/hexgrad/kokoro) 开源。模型仅 82M 参数，支持多语言多音色，生成自然流畅的语音。

- **模型 ID**: `hexgrad/Kokoro-82M`
- **HuggingFace**: [mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit](https://huggingface.co/hexgrad/Kokoro-82M)
- **GitHub**: [hexgrad/kokoro](https://github.com/hexgrad/kokoro)

## 特点

- **轻量级** — 仅 82M 参数，推理速度快
- **多语言** — 支持英语、中文、日语、西班牙语、法语、印地语、意大利语、巴西葡萄牙语
- **36+ 音色** — 每个语言提供多种音色选择
- **低资源占用** — 适合本地部署，无需 GPU

## 音色列表

### 美式英语 (11F 9M)

| 音色 ID | 性别 | 特点 |
|---------|------|------|
| `af_heart` | 女 | 高质量，推荐首选 |
| `af_bella` | 女 | 高质量，训练数据充足 |
| `af_nicole` | 女 | 高质量，训练数据充足 |
| `af_aoede` | 女 | 中等质量 |
| `af_kore` | 女 | 中等质量 |
| `af_sarah` | 女 | 中等质量 |
| `af_nova` | 女 | 中等质量 |
| `af_sky` | 女 | 中等质量 |
| `af_alloy` | 女 | 中等质量 |
| `af_jessica` | 女 | 较低质量 |
| `af_river` | 女 | 较低质量 |
| `am_michael` | 男 | 中等质量 |
| `am_fenrir` | 男 | 中等质量 |
| `am_puck` | 男 | 中等质量 |
| `am_echo` | 男 | 较低质量 |
| `am_eric` | 男 | 较低质量 |
| `am_liam` | 男 | 较低质量 |
| `am_onyx` | 男 | 较低质量 |
| `am_santa` | 男 | 较低质量 |
| `am_adam` | 男 | 较低质量 |

### 英式英语 (4F 4M)

| 音色 ID | 性别 |
|---------|------|
| `bf_emma` | 女 |
| `bf_isabella` | 女 |
| `bf_alice` | 女 |
| `bf_lily` | 女 |
| `bm_george` | 男 |
| `bm_fable` | 男 |
| `bm_lewis` | 男 |
| `bm_daniel` | 男 |

### 中文 (4F 4M)

| 音色 ID | 性别 |
|---------|------|
| `zf_xiaobei` | 女 |
| `zf_xiaoni` | 女 |
| `zf_xiaoxiao` | 女 |
| `zf_xiaoyi` | 女 |
| `zm_yunjian` | 男 |
| `zm_yunxi` | 男 |
| `zm_yunxia` | 男 |
| `zm_yunyang` | 男 |

### 日语 (4F 1M)

| 音色 ID | 性别 |
|---------|------|
| `jf_alpha` | 女 |
| `jf_gongitsune` | 女 |
| `jf_nezumi` | 女 |
| `jf_tebukuro` | 女 |
| `jm_kumo` | 男 |

## API 使用

```bash
curl http://localhost:8001/api/v1/audio/speech \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kokoro",
    "input": "你好，欢迎使用 Kokoro 语音合成。",
    "voice": "af_heart"
  }' --output out.wav
```

## 注意事项

- 短文本（少于 10-20 token）可能效果不佳，建议适当增加文本长度
- 长文本（超过 400 token）可能出现语速加快，建议分段处理
- 中文音色训练数据较少，效果可能不如英文音色
