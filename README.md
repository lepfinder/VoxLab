# HomeCore Python AI Server

这是一个为 HomeCore 提供的轻量级 AI 后端服务，主要负责语音识别 (ASR) 等计算密集型任务。

## 功能
- **ASR (语音转文字)**: 基于 Vosk 的离线语音识别，专门针对 16kHz PCM 音频优化。
- **健康检查**: 提供 `/health` 接口用于检测模型状态。

## 环境要求
- Conda (Miniconda / Miniforge)
- Python 3.11
- [Vosk 模型](https://alphacephei.com/vosk/models): 需要下载中文模型并放置在 `models/` 目录下。
  - 默认预期路径: `models/vosk-model-small-cn-0.22`

## 快速启动

### 1. 准备环境
建议使用 Conda 创建并激活虚拟环境：
```bash
conda create -n homecore-ai python=3.11
conda activate homecore-ai
```

### 2. 安装依赖
```bash
pip install -r requirements.txt
```

### 3. 下载模型
确保 `models` 目录下有模型文件。如果没有，可以下载并解压：
```bash
mkdir -p models
cd models
# 下载轻量级中文模型 (约 40MB)
curl -L https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip -o model.zip
unzip model.zip
rm model.zip
cd ..
```

### 4. 启动服务
确保已激活虚拟环境：
```bash
conda activate homecore-ai
python main.py
```
或者使用 uvicorn 直接启动：
```bash
conda activate homecore-ai
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 5. 使用 Web UI 进行可视化测试
提供了一个基于 Gradio 的 Web 控制台，方便你直接在浏览器里用麦克风录音并测试各个大模型的识别效果。
在运行了上述的 `main.py` 后，Web UI 会自动与主程序同时启动。
请直接在浏览器中访问 [http://127.0.0.1:8001/webui](http://127.0.0.1:8001/webui) 即可体验，不需要再额外启动新终端。

## API 接口

### ASR 识别 (Vosk)
- **URL**: `/asr`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Body**: `file` (音频文件，建议 16000Hz, 单声道 PCM/WAV)
- **Response**: `{"text": "识别到的文字"}`

### ASR 识别 (SenseVoice - 推荐)
- **URL**: `/funasr`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Body**: `file` (音频文件，兼容 Raw PCM 或 WAV)
- **Response**: `{"text": "识别到的文字"}`

### ASR 识别 (Qwen3-ASR)
- **URL**: `/qwen_asr`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Body**: `file` (音频文件)
- **Response**: `{"text": "识别到的文字"}`

### TTS 语音合成 (Edge-TTS)
- **URL**: `/tts`
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body**: `{"text": "你要合成的文字", "voice": "zh-CN-XiaoxiaoNeural"}`
- **Response**: 返回 `audio/mpeg` (MP3 文件流)

### TTS 语音合成 (Kokoro - 本地模型)
- **URL**: `/kokoro`
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body**: `{"text": "你要合成的文字", "voice": "af_heart", "speed": 1.0}`
- **Response**: 返回 `audio/wav` (WAV 文件流)

### TTS 语音合成 (Qwen3-TTS 变声克隆)
- **URL**: `/qwen_tts`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Body**: `text` (字符串), `ref_audio` (参考音频文件)
- **Response**: 返回 `audio/wav` (WAV 文件流)

### TTS 语音合成 (OmniVoice - Voice Design & Voice Cloning)
- **URL**: `/omni_tts`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Body**: `text` (字符串), `instruct` (可选的 Voice Design prompt 比如 "female, 四川话"), `ref_audio` (可选的参考音频)
- **Response**: 返回 `audio/wav` (WAV 文件流)

### TTS 语音合成 (VoxCPM - Voice Design)
- **URL**: `/voxcpm`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Body**: `text` (字符串), `instruct` (可选的 Voice Design prompt 比如 "年轻女性，声音温柔甜美，语速适中")
- **Response**: 返回 `audio/wav` (WAV 文件流)

### 健康检查
- **URL**: `/health`
- **Method**: `GET`
- **Response**: `{"status": "ok", "model": "..."}`
