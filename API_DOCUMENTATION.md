# HomeCore AI Server 接口文档

本文档列出了 HomeCore AI Server 目前支持的所有 ASR (语音识别)、TTS (语音合成) 和 Voiceprint (声纹识别) 接口。

## 基础信息
- **基础 URL**: `http://127.0.0.1:8001`
- **Web UI 测试地址**: `http://127.0.0.1:8001/webui/`
- **健康检查**: `GET /health`

---

## 1. ASR (语音识别) 接口

### 1.1 Vosk ASR (超轻量本地)
- **路径**: `/asr`
- **方法**: `POST`
- **Content-Type**: `multipart/form-data`
- **参数**: 
  - `file`: 上传的音频文件 (UploadFile)
- **返回值**: JSON格式 `{"text": "识别结果"}`
- **特点**: 资源占用极低，响应速度极快，适合基础命令识别。

### 1.2 SenseVoiceSmall ASR (高性能本地)
- **路径**: `/funasr`
- **方法**: `POST`
- **Content-Type**: `multipart/form-data`
- **参数**: 
  - `file`: 上传的音频文件 (UploadFile)
- **返回值**: JSON格式 `{"text": "识别结果"}`
- **特点**: 阿里出品，支持富文本识别（情感、标点、语种），中英日韩识别效果出色。

### 1.3 Qwen3-ASR (最新本地带声纹)
- **路径**: `/qwen_asr`
- **方法**: `POST`
- **Content-Type**: `multipart/form◊-data`
- **参数**: 
  - `file`: 上传的音频文件 (UploadFile)
- **返回值**: JSON格式 `{"text": "识别结果", "spk_embedding": [...]}`
- **特点**: 基于 Qwen3 架构，识别精度极高，支持 Apple Silicon (MLX) 加速，并在识别同时附带提取声纹特征 (Voiceprint Embedding)。

---

## 2. TTS (语音合成) 接口

### 2.1 Edge-TTS (微软在线)
- **路径**: `/tts`
- **方法**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded` 或 `multipart/form-data`
- **参数**:
  - `text` (必须): 要合成的文本
  - `voice` (可选, 默认 `zh-CN-XiaoxiaoNeural`): 发音人 ID
- **返回值**: 16kHz WAV 音频文件 (`audio/wav`)
- **特点**: 无需本地显存，音质自然，内部自动重采样为 16kHz PCM 单声道。

### 2.2 Kokoro TTS (极速本地)
- **路径**: `/kokoro`
- **方法**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded` 或 `multipart/form-data`
- **参数**:
  - `text` (必须): 要合成的文本
  - `voice` (可选, 默认 `af_heart`): 发音人 ID
  - `speed` (可选, 默认 `1.0`): 语速
- **返回值**: WAV 音频文件 (`audio/wav`)
- **特点**: 速度极快，英文效果世界顶尖，中文效果优良。

### 2.3 OmniVoice (本地克隆/捏人)
- **路径**: `/omni_tts`
- **方法**: `POST`
- **Content-Type**: `multipart/form-data`
- **参数**:
  - `text` (必须): 合成文本
  - `instruct` (可选, 默认 `女，青年，中音调`): 音色设计描述 (Voice Design)
  - `ref_audio` (可选): 参考音频文件，用于音色克隆
  - `ref_text` (可选): 参考音频的文字内容 (填写可加速)
- **返回值**: WAV 音频文件 (`audio/wav`)
- **特点**: 支持零样本语音克隆和通过自然语言描述来“设计”音色。

### 2.4 VoxCPM (情感捏人)
- **路径**: `/voxcpm`
- **方法**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded` 或 `multipart/form-data`
- **参数**:
  - `text` (必须): 合成文本
  - `instruct` (可选): 带有情感或语气的 Voice Design 描述词
- **返回值**: WAV 音频文件 (`audio/wav`)
- **特点**: 情感表现力强，支持高度自定义的音色描述。

### 2.5 Qwen3-TTS (全能语音中枢)
- **路径**: `/qwen_tts`
- **方法**: `POST` 
- **Content-Type**: `multipart/form-data`
- **参数**:
  - `text` (必须): 合成文本
  - `voice` (可选): 发音人名，如 `Serena` (苏瑶), `Uncle Fu` (福伯), `Eric` (四川话)
  - `ref_audio` (可选): 参考音频，用于零样本克隆
  - `ref_text` (可选): 参考音频的文本
  - `instruct` (可选): 音色描述词或基础指示 (默认 `A natural speech.`)
- **返回值**: WAV 音频文件 (`audio/wav`)
- **特点**: 支持预置精品音色、方言、多语种，以及强大的零样本克隆和音色捏人。

### 2.6 Qwen3-TTS 流式接口 (低延迟)
- **路径**: `/qwen_tts_stream`
- **方法**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded` 或 `multipart/form-data`
- **参数**:
  - `text` (必须): 合成文本
  - `voice` (可选, 默认 `Ethan`): 发音人名
  - `instruct` (可选, 默认 `A natural speech.`): 提示词
- **返回值**: 流式返回 PCM 原始音频 (`audio/pcm`, 16kHz, 16bit, 单声道)
- **特点**: 超低延迟流式返回，适合对话场景。

---

## 3. 声纹识别 (Voiceprint) 接口

### 3.1 提取声纹特征
- **路径**: `/voiceprint/extract`
- **方法**: `POST`
- **Content-Type**: `multipart/form-data`
- **参数**:
  - `file` (必须): 上传的音频文件
- **返回值**: JSON格式 `{"embedding": [浮点数列表...]}` 
- **特点**: 使用 ERes2NetV2 提取说话人声纹特征。

### 3.2 比对声纹相似度
- **路径**: `/voiceprint/compare`
- **方法**: `POST`
- **Content-Type**: `application/json`
- **参数**:
  - `emb1`: 声纹特征向量 1 (数组列表)
  - `emb2`: 声纹特征向量 2 (数组列表)
- **返回值**: JSON格式 `{"similarity": 0.85...}` 
- **特点**: 计算余弦相似度，值越高表示越可能是同一个人（通常阈值 0.6 左右）。

---

## 4. 常见问题 (FAQ)
- **如何加速克隆?** 在使用 Qwen3 或 OmniVoice 进行克隆时，务必填写 `ref_text`（参考音频的内容），这会跳过耗时的内部 ASR 识别步骤。
- **音频格式问题**: 系统内部大量使用了 16000Hz 单声道的 PCM WAV 格式（包含 TTS 输出和 ASR 输入预处理），对接时请注意采样率一致，尤其是 `/qwen_tts_stream` 流式输出的原始 PCM 数据。
- **本地模型缓存**: 所有模型默认缓存在 `~/.cache/modelscope` 和 `~/.cache/huggingface`。
