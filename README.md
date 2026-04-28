# HomeCore AI Server

这是一个基于 FastAPI 构建的高性能、模块化本地 AI 模型服务平台。它将多种 AI 模型（LLM, ASR, TTS, Voiceprint）集成在一起，并提供统一的 **OpenAI 兼容接口**。

## 核心特性

- **OpenAI 标准兼容**: 提供 `/v1/chat/completions`, `/v1/audio/transcriptions`, `/v1/audio/speech` 等标准接口，可直接对接任何支持 OpenAI 协议的客户端。
- **延迟加载 (Lazy Loading)**: 模型仅在第一次请求时加载，节省启动时间和内存。
- **自动卸载 (Auto Unloading)**: 监控模型空闲状态，超时（默认 10 分钟）未使用的模型将自动从显存/内存中释放。
- **Mac 性能优化**: 针对 Apple Silicon 深度优化，支持 MPS 加速和 MLX 框架。
- **模块化架构**: 插件化的 Provider 设计，方便快速接入新模型。

## 支持的模型

### ASR (语音转文字)
- **SenseVoice**: 高精度、多语言语音识别。
- **Vosk**: 轻量级离线识别。
- **Qwen3-ASR**: 基于 MLX 的高性能 ASR。

### TTS (文字转语音)
- **Kokoro**: 超高质量、轻量级本地 TTS。
- **Qwen3-TTS**: 支持声音克隆和捏人 (Voice Design)。
- **Edge-TTS**: 微软云端高质量语音。
- **OmniVoice / VoxCPM**: 多种本地推理引擎。

### LLM (大语言模型)
- **Ollama Proxy**: 代理并转发请求至本地运行的 Ollama。

## 快速开始

### 1. 准备环境
建议使用 Conda：
```bash
conda create -n homecore-ai python=3.11
conda activate homecore-ai
pip install -r requirements.txt
```

### 2. 配置模型
编辑 `config.py` 来配置你的模型 Repository ID 或本地路径。

### 3. 启动服务
```bash
python main.py
```
服务默认运行在 [http://localhost:8001](http://localhost:8001)。

## API 使用示例

### 对话 (LLM)
```bash
curl http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5-coder:7b",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

### 语音识别 (ASR)
```bash
curl http://localhost:8001/v1/audio/transcriptions \
  -F "file=@test.wav" \
  -F "model=sensevoice"
```

### 语音合成 (TTS)
```bash
curl http://localhost:8001/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kokoro",
    "input": "欢迎使用本地 AI 服务",
    "voice": "af_heart"
  }' --output output.wav
```

## 项目结构

- `app/api/v1/`: 标准 API 实现层。
- `app/core/`: 核心逻辑（ModelManager 等）。
- `app/providers/`: 模型适配器。
- `app/schemas/`: OpenAI 数据协议定义。
- `config.py`: 统一配置中心。

## License
MIT
