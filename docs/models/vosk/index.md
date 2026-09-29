# Vosk

## 简介

Vosk 是轻量级离线语音识别引擎，基于 Kaldi 框架，支持多种语言，适合嵌入式设备和资源受限环境。

- **模型 ID**: `vosk-model-small-cn-0.22`
- **GitHub**: [alphacep/vosk-api](https://github.com/alphacep/vosk-api)

## 特点

- **轻量级** — 中文小模型仅约 50MB
- **纯离线** — 无需网络连接，数据完全本地处理
- **低资源占用** — 适合内存有限的设备
- **多语言** — 支持中文、英文、俄语等多种语言
- **跨平台** — 可在各种平台上运行

## 模型特点

| 特点 | 说明 |
|------|------|
| 小模型 | 中文小模型仅约 50MB，适合内存有限的设备 |
| 纯 CPU | 无需 GPU，在 CPU 上也能流畅运行 |
| 完全离线 | 无需网络连接，数据完全本地处理 |

## API 使用

```bash
curl http://localhost:8001/api/v1/audio/transcriptions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/audio.wav" \
  -F "model=vosk"
```

## 注意事项

- 识别精度不如 SenseVoice 和 Qwen ASR，但资源占用最低
- 适合对隐私要求极高、完全离线的场景
- 模型已内置，无需额外下载
