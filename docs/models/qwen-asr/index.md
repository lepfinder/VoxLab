# Qwen ASR

## 模型简介

Qwen ASR 是基于通义千问（Qwen）架构的语音识别模型，针对 Apple Silicon 进行了深度优化。在 macOS 上使用 MLX 框架充分利用统一内存架构，实现高效的本地语音识别。

## 技术规格

| 属性 | 值 |
|------|------|
| 模型 ID | `mlx-community/Qwen3-ASR-0.6B-4bit` |
| 框架 | MLX (macOS) / PyTorch (Linux) |
| 参数量 | 0.6B |
| 量化 | 4-bit (MLX) / bf16 (PyTorch) |

## 跨平台支持

| 平台 | 框架 | 说明 |
|------|------|------|
| macOS | MLX | 利用 Apple Silicon 统一内存架构，4-bit 量化，低延迟推理 |
| Linux | PyTorch | 支持 CUDA 加速，使用官方 bf16 模型 |

## 核心特性

### Apple Silicon 优化

专为 M 系列芯片设计，利用统一内存和 MLX 框架实现高效推理，无需 GPU 即可获得出色的识别速度。

### 低延迟

4-bit 量化模型体积小、推理快，适合实时语音识别场景。

### 高精度

基于 Qwen 大模型架构，在中文和英文识别任务上均有优秀表现。

### 隐私安全

完全本地运行，无需网络连接，适合隐私敏感场景。

## API 接口

### 语音转写

```
POST /api/v1/audio/transcriptions
```

**请求参数（multipart/form-data）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | 音频文件（wav/mp3 等） |
| model | string | 是 | 固定值 `qwen` |

### curl 示例

```bash
curl http://localhost:8001/api/v1/audio/transcriptions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/audio.wav" \
  -F "model=qwen"
```

## 相关链接

- GitHub: [QwenLM/Qwen-Audio](https://github.com/QwenLM/Qwen-Audio)
- HuggingFace: [mlx-community/Qwen3-ASR-0.6B-4bit](https://huggingface.co/mlx-community/Qwen3-ASR-0.6B-4bit)
