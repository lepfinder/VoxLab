# Edge TTS

## 简介

Edge TTS 是微软 Edge 浏览器提供的云端语音合成服务，免费且高质量，支持多种语言和音色。

- **框架**: Edge TTS API
- **无需本地模型** — 完全云端推理，不占用本地资源

## 特点

- **云端免费** — 无需 GPU，无需本地模型
- **多语言** — 支持中文、英文等多种语言
- **多音色** — 每种语言提供多种音色选择
- **高质量** — 微软官方 Neural TTS 引擎
- **无需本地资源** — 适合无 GPU 环境

## 可用音色

### 中文

| 音色 ID | 描述 |
|---------|------|
| `zh-CN-XiaoxiaoNeural` | 晓晓（女） |
| `zh-CN-YunxiNeural` | 云希（男） |
| `zh-CN-YunjianNeural` | 云健（男） |
| `zh-CN-XiaoyiNeural` | 晓伊（女） |

### 英文

| 音色 ID | 描述 |
|---------|------|
| `en-US-GuyNeural` | Guy（男） |
| `en-US-JennyNeural` | Jenny（女） |

## API 使用

```bash
curl http://localhost:8001/api/v1/audio/speech \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "edge-tts",
    "input": "你好，欢迎使用 Edge TTS 语音合成。",
    "voice": "zh-CN-XiaoxiaoNeural"
  }' --output output.mp3
```

## 注意事项

- 需要网络连接才能使用（云端服务）
- 返回格式为 MP3，其他模型返回 WAV
- 完全免费，但受微软服务可用性影响
