# SenseVoice

## 模型简介

SenseVoice 是阿里巴巴达摩院开源的高精度语音识别模型，基于 FunASR 框架构建。支持多语言识别、情感识别和声纹特征提取，在多个基准测试中达到业界领先水平。

## 技术规格

| 属性 | 值 |
|------|------|
| 模型 ID | `iic/SenseVoiceSmall` |
| 框架 | FunASR + PyTorch |
| 开发者 | 阿里巴巴达摩院 |
| 参数量 | Small 版本（轻量级） |
| 支持语言 | 中文、英文、日语、韩语、粤语 |

## 核心特性

### 高精度识别

在 AISHELL-1、AISHELL-2 等中文基准上达到业界领先的字准率（CER），英文表现同样出色。

### 声纹提取

内置声纹编码能力，可提取说话人特征向量，用于声纹认证、说话人识别等场景。

### VAD 端点检测

集成语音活动检测（Voice Activity Detection），自动检测语音片段的起止时间，无需额外 VAD 模块。

### 情感识别

能够识别语音中的情感信息，支持开心、悲伤、愤怒、中性等情感分类。

## 模型参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| language | string | `zh` | 识别语言 |
| use_itn | bool | `true` | 启用逆文本正则化（数字转阿拉伯数字） |
| merge_vad | bool | `true` | 合并 VAD 检测到的短语音片段 |

## API 接口

### 语音转写

```
POST /api/v1/audio/transcriptions
```

**请求参数（multipart/form-data）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | 音频文件（wav/mp3 等） |
| model | string | 是 | 固定值 `sensevoice` |

### curl 示例

```bash
curl http://localhost:8001/api/v1/audio/transcriptions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/audio.wav" \
  -F "model=sensevoice"
```

## 相关链接

- GitHub: [FunAudioLLM/SenseVoice](https://github.com/FunAudioLLM/SenseVoice)
- HuggingFace: [iic/SenseVoiceSmall](https://huggingface.co/iic/SenseVoiceSmall)
- FunASR: [modelscope/FunASR](https://github.com/modelscope/FunASR)
