# Fun-ASR-Nano

阿里通义实验室 Fun-ASR 系列的 800M 端侧/本地 ASR 模型，作为 SenseVoice 的官方后继产品线。

## 能力

- 中文 / 英文 / 日文
- 中文 7 大方言（吴、粤、闽、客家、赣、湘、晋）+ 26 地方口音
- 歌词、说唱识别
- 远场、高噪场景优化

## 在 VoxLab 中使用

```bash
curl http://localhost:8001/api/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-your-token" \
  -F "file=@audio.wav" \
  -F "model=fun_asr_nano"
```

## 配置

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `FUN_ASR_HUB` | `ms` | `ms`=ModelScope（含 CTC 时间戳），`hf`=HuggingFace |
| `FUN_ASR_REMOTE_CODE` | 空 | 可选，指向 Fun-ASR 仓库 `model.py` |

## 资源

- 仓库: https://github.com/QwenAudio/Fun-ASR
- 模型: FunAudioLLM/Fun-ASR-Nano-2512
- 许可: Apache-2.0
