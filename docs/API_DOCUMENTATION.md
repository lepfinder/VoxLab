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
  - `model`: 模型关键字 (`qwen`, `llama3`, `glm4`, `mistral`)
  - `messages`: 消息列表 `[{"role": "user", "content": "..."}]`
  - `stream`: 是否开启流式返回 (目前 Playground 默认使用非流式)
- **示例**:
  ```bash
  curl http://localhost:8001/api/v1/chat/completions \
    -H "Authorization: Bearer sk-your-token" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "qwen",
      "messages": [{"role": "user", "content": "你好"}],
      "stream": false
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
用于将文字转换为语音。

- **路径**: `/api/v1/audio/speech`
- **方法**: `POST`
- **参数**:
  - `model`: 模型 ID (`kokoro`, `qwen`, `voxcpm`, `edge-tts`)
  - `input`: 目标文本
  - `voice`: 发音人 ID (如 `af_heart` 或 Qwen 对应的参考音频)
- **示例**:
  ```bash
  curl http://localhost:8001/api/v1/audio/speech \
    -H "Authorization: Bearer sk-your-token" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "kokoro",
      "input": "你好",
      "voice": "af_heart"
    }' --output out.wav
  ```

---

## 4. 系统管理 (Admin) 接口
主要供管理后台使用。

- **获取状态**: `GET /admin/stats`
- **模型列表**: `GET /admin/models`
- **Token 管理**:
  - 列出: `GET /admin/tokens`
  - 创建: `POST /admin/tokens` (Body: `{"name": "token_name"}`)
  - 删除: `DELETE /admin/tokens/{token_id}`
- **审计日志**: `GET /admin/logs`

---

## 5. 核心特性说明

### 5.1 内存自动管理
系统内置了 **ModelManager**。模型在首次被调用时按需加载。如果 **10 分钟**内没有新的请求，模型将自动从显存/内存中卸载，确保不长时间占用系统资源。

### 5.2 错误码参考
- `401 Unauthorized`: 未提供 Token 或 Token 无效。
- `400 Bad Request`: 参数错误或不支持的模型类型。
- `502 Upstream Error`: 开发模式下前端代理转发失败。
