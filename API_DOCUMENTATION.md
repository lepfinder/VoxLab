# HomeCore AI Server 接口文档 (V1 标准版)

本文档详细介绍了 HomeCore AI Server 提供的 **OpenAI 兼容接口**。

## 基础信息
- **基础 URL**: `http://127.0.0.1:8001`
- **Swagger UI**: `http://127.0.0.1:8001/docs`
- **默认协议**: OpenAI API 标准

---

## 1. 对话接口 (Chat Completions)

用于与本地 LLM 进行对话。

- **路径**: `/v1/chat/completions`
- **方法**: `POST`
- **参数**: 遵循 OpenAI 标准格式
  - `model`: 模型名称（对应 Ollama 中的名称，如 `qwen2.5`）
  - `messages`: 消息列表 `[{"role": "user", "content": "..."}]`
  - `stream`: 是否开启流式返回 (SSE)
- **示例**:
  ```bash
  curl http://localhost:8001/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
      "model": "qwen2.5",
      "messages": [{"role": "user", "content": "你好"}],
      "stream": false
    }'
  ```

---

## 2. 语音识别 (ASR) 接口

用于将音频转换为文字。

- **路径**: `/v1/audio/transcriptions`
- **方法**: `POST`
- **Content-Type**: `multipart/form-data`
- **参数**:
  - `file`: 音频文件 (wav, mp3, etc.)
  - `model`: 模型 ID（`sensevoice`, `vosk`, `qwen`）
- **示例**:
  ```bash
  curl http://localhost:8001/v1/audio/transcriptions \
    -F "file=@audio.wav" \
    -F "model=sensevoice"
  ```

---

## 3. 语音合成 (TTS) 接口

用于将文字转换为语音。

- **路径**: `/v1/audio/speech`
- **方法**: `POST`
- **Content-Type**: `application/json`
- **参数**:
  - `model`: 模型 ID (`kokoro`, `edge-tts`, `qwen`, `omni`, `vox`)
  - `input`: 目标文本
  - `voice`: 发音人 ID (根据模型而定，如 `af_heart`)
  - `speed`: 语速 (可选, 默认 1.0)
- **示例**:
  ```bash
  curl http://localhost:8001/v1/audio/speech \
    -H "Content-Type: application/json" \
    -d '{
      "model": "kokoro",
      "input": "你好",
      "voice": "af_heart"
    }' --output out.wav
  ```

---

## 4. 架构特性

### 4.1 模型管理
- **延迟加载**: 模型在第一次被接口调用时才会加载到显存/内存中。
- **自动释放**: 默认情况下，模型在 **10 分钟**内没有再次被使用，系统会自动将其从内存中卸载，以回收 Mac 宝贵的统一内存。

### 4.2 硬件加速
- 自动检测并启用 Apple Silicon 的 **MPS (Metal Performance Shaders)** 加速。
- ASR/TTS 针对 16k 采样率进行了优化。

---

## 5. 错误处理
接口返回标准的 HTTP 状态码及 JSON 错误详情：
- `400`: 参数错误或不支持的模型。
- `500`: 模型推理失败或加载异常。
