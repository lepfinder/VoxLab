# VoxCPM

## 模型简介

VoxCPM 是清华大学 OpenBMB 团队开源的语音合成模型，支持通过自然语言指令控制语音的情感和风格。该模型针对中文场景做了深度优化，能够生成富有表现力的高质量语音。

## 技术规格

| 属性 | 值 |
|------|------|
| 模型 ID | `openbmb/VoxCPM2` |
| 框架 | PyTorch |
| 开发者 | 清华大学 OpenBMB |
| 特色 | 情感控制、指令驱动 |

## 情感控制

VoxCPM 支持通过情感指令控制合成语音的风格：

| 情感 | 描述 |
|------|------|
| 开心的 | 欢快、愉悦的语调 |
| 严肃的 | 正式、庄重的表达 |
| 温柔的 | 柔和、亲切的语气 |
| 激动的 | 兴奋、高亢的情绪 |
| 平静的 | 沉稳、安宁的基调 |
| 悲伤的 | 低沉、哀伤的语调 |

## API 接口

### 语音合成

```
POST /api/v1/audio/speech
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | 是 | 固定值 `voxcpm` |
| input | string | 是 | 要合成的文本 |
| voice | string | 是 | 音色，默认 `default` |

### curl 示例

```bash
curl http://localhost:8001/api/v1/audio/speech \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "voxcpm",
    "input": "你好，这是 VoxCPM 语音合成测试",
    "voice": "default"
  }' --output output.wav
```

## 相关链接

- GitHub: [OpenBMB/VoxCPM](https://github.com/OpenBMB/VoxCPM)
- HuggingFace: [openbmb/VoxCPM2](https://huggingface.co/openbmb/VoxCPM2)
