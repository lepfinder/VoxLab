# Fun-CosyVoice3

阿里通义 CosyVoice 3.0 的 0.5B 轻量开源模型，主打零样本克隆与方言，Apache-2.0。

## 能力

- 9 语种（中英日韩德西法意俄）+ 18+ 中文方言
- 零样本音色克隆（需参考音频 + 完整转写文本）
- 指令控制（方言 / 情感 / 语速）
- 双流式，首包约 150ms（官方数据）

## 前置条件

需先 vendor CosyVoice 仓库并下载模型：

```bash
bin/setup_fun_providers
```

或见 `docs/FUN_PROVIDERS.md`。

## 在 VoxLab 中使用

```bash
curl http://localhost:8001/api/v1/audio/speech \
  -H "Authorization: Bearer sk-your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "fun_cosyvoice3",
    "input": "你好，这是克隆测试。",
    "response_format": "wav",
    "ref_audio": "data:audio/wav;base64,...",
    "ref_text": "参考音频完整转写"
  }' --output out.wav
```

> **注意**：`ref_text` 必须覆盖参考音频全文，否则 zero-shot 可能崩坏。

## 资源

- 仓库: https://github.com/FunAudioLLM/CosyVoice
- 模型: FunAudioLLM/Fun-CosyVoice3-0.5B-2512
- 许可: Apache-2.0
