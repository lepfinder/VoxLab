# VoxLab 接口文档 (V1 标准版)

本文档详细介绍了 VoxLab 语音实验室提供的 **OpenAI 兼容接口** 及系统管理接口。

## 基础信息
- **基础 URL**: `http://127.0.0.1:8001`
- **管理后台**: `http://127.0.0.1:8001` (浏览器访问)
- **鉴权方式**: `Bearer Token` (在管理后台生成)

> [!IMPORTANT]
> 所有接口请求必须包含 Header: `Authorization: Bearer <YOUR_TOKEN>`

---

## 1. 对话接口 (Chat Completions)
用于与本地 LLM 进行对话。

- **路径**: `/api/v1/chat/completions`
- **方法**: `POST`
- **参数**:
  - `model` (string, 可选): 模型关键字 (`qwen`, `llama3`, `glm4`, `mistral`)
  - `messages` (array, 必填): 消息列表 `[{"role": "user", "content": "..."}]`
  - `temperature` (number, 可选): 采样温度，控制生成随机性，默认 `0.7`。
  - `stream` (boolean, 可选): 是否流式返回（目前由于底层适配，本接口始终返回 Server-Sent Events 格式流）。
  - `conversation_id` (string, 可选): 会话 ID。若传入且会话存在，系统会自动将该轮问答对话持久化到本地 SQLite 数据库中。
- **示例**:
  ```bash
  curl http://localhost:8001/api/v1/chat/completions \
    -H "Authorization: Bearer sk-your-token" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "qwen",
      "messages": [{"role": "user", "content": "你好"}],
      "temperature": 0.7,
      "conversation_id": "your-conversation-uuid"
    }'
  ```

---

## 2. 语音识别 (ASR) 接口
用于将音频转换为文字。

- **路径**: `/api/v1/audio/transcriptions`
- **方法**: `POST`
- **参数**:
  - `file`: 音频文件 (multipart/form-data)
  - `model`: 模型 ID (`sensevoice`, `qwen`, `vosk`)
- **示例**:
  ```bash
  curl http://localhost:8001/api/v1/audio/transcriptions \
    -H "Authorization: Bearer sk-your-token" \
    -F "file=@audio.wav" \
    -F "model=qwen"
  ```

---

## 3. 语音合成 (TTS) 接口
用于将文字转换为语音。支持流式返回与非流式返回。

- **路径**: `/api/v1/audio/speech`
- **方法**: `POST`
- **参数**:
  - `model`: 模型 ID (`kokoro`, `qwen`, `voxcpm`, `omni`, `edge-tts`)
  - `input`: 目标文本
  - `voice`: 发音人 ID / 音色名称（如 Kokoro 的 `am_nicole`，Edge TTS 的 `zh-CN-XiaoxiaoNeural` 等）
  - `response_format` (可选): 响应音频格式，默认为 `"mp3"`。
    - `"mp3"`: 返回 MP3 音频。若使用 `edge` 模型，将启用 Chunked 流式返回。
    - `"pcm"`: 返回原始 16kHz PCM 音频流。支持 `edge` 和 `qwen` 模型进行流式返回（`StreamingResponse`）。
    - `"opus"`: 返回低延迟 Opus 编码流，主要用于硬件连接（支持 `edge` 和 `qwen` 进行流式切片返回）。
    - `"wav"`: 非流式，一次性生成并返回标准 WAV 格式。
  - `speed` (可选): 语速控制，默认为 `1.0`。
- **示例 (非流式获取 WAV)**:
  ```bash
  curl http://localhost:8001/api/v1/audio/speech \
    -H "Authorization: Bearer sk-your-token" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "kokoro",
      "input": "你好，语音合成测试。",
      "voice": "am_nicole",
      "response_format": "wav"
    }' --output out.wav
  ```
- **示例 (流式获取 MP3)**:
  ```bash
  curl http://localhost:8001/api/v1/audio/speech \
    -H "Authorization: Bearer sk-your-token" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "edge",
      "input": "这是一段很长的测试流式语音合成的长文本，它会一边合成一边下发数据。",
      "voice": "zh-CN-XiaoxiaoNeural",
      "response_format": "mp3"
    }' --no-buffer --output out.mp3
  ```

---

## 4. 语音活动检测 (VAD) 接口
用于定位音频文件中含有人声说话的起止时间片段。

- **路径**: `/api/v1/audio/vad`
- **方法**: `POST`
- **参数**:
  - `file`: 音频文件 (multipart/form-data)
  - `engine` (string, Form, 可选): VAD 检测引擎，支持 `silero`, `webrtc`, `energy`。默认为 `silero`。
  - `threshold` (float, Form, 可选): 检测阈值（仅在 `energy` 引擎中生效），默认 `0.02`。
  - `sensitivity` (int, Form, 可选): 敏感度级别（仅在 `webrtc` 引擎中生效，可选值为 `0` 至 `3`），默认 `2`。
- **示例**:
  ```bash
  curl http://localhost:8001/api/v1/audio/vad \
    -H "Authorization: Bearer sk-your-token" \
    -F "file=@audio.wav" \
    -F "engine=silero"
  ```
- **返回**:
  ```json
  {
    "engine": "silero",
    "segments": [
      {
        "start": 0.45,
        "end": 2.12
      }
    ],
    "process_time_ms": 15.68
  }
  ```

---

## 5. 发音人语音合成接口
根据数据库中预设的发音人 ID 直接生成该发音人性格和音色配置的语音（聚合了发音人绑定的 TTS 引擎与 Voice 参数）。

- **路径**: `/api/v1/audio/speech/speaker`
- **方法**: `POST`
- **参数**:
  - `speaker_id` (string, 必填): 目标发音人 ID（例如 `haruna`, `alex`, `morpheus`）。
  - `text` (string, 必填): 目标文本。
  - `response_format` (string, 可选): 响应的音频格式（支持 `mp3`、`wav`、`pcm`、`opus`），默认 `"mp3"`。
- **示例**:
  ```bash
  curl http://localhost:8001/api/v1/audio/speech/speaker \
    -H "Authorization: Bearer sk-your-token" \
    -H "Content-Type: application/json" \
    -d '{
      "speaker_id": "haruna",
      "text": "你好，很高兴见到你！",
      "response_format": "mp3"
    }' --output haruna.mp3
  ```

---

## 6. 声纹特征提取 (Voiceprint) 接口
用于提取音频文件中的人声声纹高维特征向量。

- **路径**: `/api/v1/voiceprint/extract`
- **方法**: `POST`
- **参数**:
  - `file`: 音频文件 (multipart/form-data)
- **示例**:
  ```bash
  curl http://localhost:8001/api/v1/voiceprint/extract \
    -H "Authorization: Bearer sk-your-token" \
    -F "file=@voice.wav"
  ```
- **返回**:
  ```json
  {
    "embedding": [
      0.0123,
      -0.0456,
      0.789
    ]
  }
  ```

---

## 7. 实时语音流 (ASR) WebSocket 接口
用于建立长连接，实时发送音频流并接收转写结果（适用于硬件对接及低延迟对话场景）。

- **路径**: `ws://localhost:8001/api/v1/audio/voice`
- **协议**: `WebSocket`
- **通信流程**:
  1. 客户端建立 WebSocket 连接。
  2. 客户端以二进制帧的形式持续发送 **Opus 编码** 的音频数据（推荐采样率 16000Hz，单声道，每帧大小 960 字节/60ms）。
  3. 服务端内置静音检测（VAD），当检测到说话结束时，自动进行转写，并向客户端推送转写结果。
- **服务端推送结果格式 (JSON)**:
  ```json
  {
    "type": "asr_result",
    "text": "今天天气怎么样"
  }
  ```

---

## 8. 智能通话 Agent WebSocket 接口
用于建立低延迟的双向通话连接，聚合了 VAD 检测、ASR 语音转文本、LLM 智能对话和 TTS 语音合成流。支持客户端发送语音/文字，支持用户打断 AI 说话。

- **路径**: `ws://localhost:8001/api/v1/audio/agent/ws`
- **协议**: `WebSocket`
- **查询参数 (Query Params)**:
  - `speaker_id` (string, 可选): 指定发音人 ID（例如 `haruna`、`alex`、`morpheus`）。默认为 `haruna`。
  - `conversation_id` (string, 可选): 对话 ID。如果提供，连接建立时会自动加载并继承该会话的历史对话上下文。

### 8.1 通信流程与控制信令

客户端建立连接后，主要通过**二进制帧**发送音频数据，同时通过发送**文本帧 (JSON)** 发送控制信令。

#### 1) 客户端发送控制信号 (文本帧 JSON)
- **启动或切换会话**:
  ```json
  {
    "type": "start",
    "speaker_id": "haruna",
    "conversation_id": "your-conversation-uuid"
  }
  ```
- **打断 AI**: 当用户需要打断正在播报的 AI 语音时发送：
  ```json
  {
    "type": "interrupt"
  }
  ```

#### 2) 客户端发送音频数据 (二进制帧)
* 客户端需要通过二进制消息持续发送原始 PCM 音频流（**采样率 16000Hz，16-bit，单声道**）。

---

### 8.2 服务端推送消息格式 (文本帧 JSON)

在整个交互生命周期内，服务端会推送包含状态变更、文本流和语音流在内的多种 JSON 帧：

#### 1) 状态变更消息
当 Agent 的运行状态发生改变时，会发送类型为 `status` 的消息：
```json
{
  "type": "status",
  "status": "listening" 
}
```
* **状态定义**:
  - `listening`: 准备就绪，正在监听用户输入。
  - `recognizing`: 用户停止说话，正在调用 ASR 进行转写。
  - `thinking`: 正在请求大模型，生成回复文本。
  - `speaking`: 正在流式播放 AI 合成的语音。

#### 2) ASR 识别结果消息
当用户说话结束且 ASR 识别完成后，向客户端通知转写文本：
```json
{
  "type": "asr_result",
  "text": "今天天气怎么样"
}
```

#### 3) LLM 文本流消息
大模型生成回复时的流式推送事件：
* **大模型开始生成**: `{"type": "llm_start"}`
* **大模型输出增量分片**:
  ```json
  {
    "type": "llm_chunk",
    "text": "今天"
  }
  ```
* **大模型生成结束**: `{"type": "llm_end"}`

#### 4) 流式 TTS 音频推送消息
服务端会将 LLM 输出的文本按标点符号分割为句子，并实时进行 TTS 语音合成，分片下发：
* **音频数据分片**: 
  ```json
  {
    "type": "audio_chunk",
    "audio": "UklGRtb... (Base64 编码的 16kHz PCM 音频数据)"
  }
  ```
* **音频推送完毕**: `{"type": "audio_end"}`

#### 5) 打断事件通知
当用户在 AI 播报期间开始说话并触发打断时，服务端会发送打断通知，以指示前端播放器立即停止播放当前音频：
```json
{
  "type": "interrupt"
}
```

---

## 7. 核心特性说明

### 7.1 内存自动管理
系统内置了 **ModelManager**。模型在首次被调用时按需加载。如果 **10 分钟**内没有新的请求，模型将自动从显存/内存中卸载，确保不长时间占用系统资源。

### 7.2 错误码参考
- `401 Unauthorized`: 未提供 Token 或 Token 无效。
- `400 Bad Request`: 参数错误或不支持的模型类型。
- `502 Upstream Error`: 开发模式下前端代理转发失败。

