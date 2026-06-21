# VoxLab

一个专注于本地语音技术研究与测试的语音实验室平台。基于 FastAPI 和 Next.js 构建，接入多个本地可运行的 ASR（语音识别）和 TTS（文字转语音）服务，提供演练场测试和相关接口文档，并对外提供标准的 API 服务。

GitHub 仓库: [https://github.com/lepfinder/VoxLab](https://github.com/lepfinder/VoxLab)  
Clone 地址: `git@github.com:lepfinder/VoxLab.git`

## 🌟 核心特性

- **🚀 全能模型支持**：
  - **Chat**: 支持 Qwen, Llama3, GLM 等主流大模型。
  - **ASR (语音转文字)**: 集成 SenseVoice, Qwen ASR, Vosk。
  - **TTS (文字转语音)**: 集成 Kokoro, VoxCPM, Qwen-TTS, Edge-TTS, OmniVoice。
- **🎙️ 智能通话与文本净化**：
  - 支持 WebSocket 全双工流式通话、静音打断以及实时字幕追踪。
  - 内置 **TTS 文本净化过滤机制**：在发送给 TTS 合成之前，自动剥离括号及星号情感动作描述（如 `(笑)`、`*歪头*`），并过滤纯标点静音分句，杜绝发声杂音，同时在快照与数据库中依然保留最完整的内容。
- **🗣️ 音色解耦与克隆管理**：
  - 支持发音人 (Speaker) 与音色 (Voice) 解耦。
  - 提供专属**人声克隆功能**：支持一键上传参考音频及其参考文本，Mac 端支持 MLX Base 模型本地快速克隆，Linux 支持原生 PyTorch 芯片加速。
  - 每个发音人可独立配置个性化的 System Prompt 与大模型供应商路由。
- **🔌 OpenAI 兼容**：标准化的 `/api/v1/chat/completions`、`/api/v1/audio/transcriptions` 和 `/api/v1/audio/speech` 接口，可无缝接入 Dify、FastGPT 等客户端。
- **📊 现代化管理面板**：
  - **可视化仪表盘**: 实时监控系统请求量、Token 消耗及响应时长。
  - **Token 管理**: 自定义多组 API Key，支持权限控制。
  - **调用日志**: 详尽的请求历史审计，包含耗时和 Token 统计。
  - **全能演练场 (Playground)**: 内置聊天、ASR 转录、TTS 合成试听功能。
- **🧠 自动化模型管理**：
  - **延迟加载**: 只有在接口被调用时才加载模型。
  - **超时自动卸载**: 默认 10 分钟无调用自动释放显存/内存。
- **🌓 极致设计**: 支持深色/浅色模式切换，响应式布局。

## 🛠️ 技术栈

- **Backend**: Python 3.11, FastAPI, Uvicorn, SQLModel (SQLite).
- **Frontend**: Next.js 14, Tailwind CSS, Lucide Icons, Recharts.
- **ML Engine**: MLX (optimized for Apple Silicon).

## 🚀 快速开始

### 1. 准备环境
```bash
# 创建并激活 Conda 环境
conda create -n voxlab python=3.11
conda activate voxlab

# 安装 Python 依赖
pip install -r requirements.txt

# 安装前端依赖
cd dashboard
npm install
cd ..
```

### 2. 启动服务

#### 开发模式 (支持前端热更新)
```bash
# 窗口 A: 启动前端开发服务器
cd dashboard
npm run dev

# 窗口 B: 启动后端代理
conda activate voxlab
DEV_MODE=true python main.py
```
访问：`http://localhost:8001`

#### 生产模式
```bash
# 编译前端
cd dashboard
npm run build
cd ..

# 启动全栈服务器
python main.py
```
访问：`http://localhost:8001`

## 📖 API 接口说明

| 接口类型 | 端点 | 描述 |
| :--- | :--- | :--- |
| **Chat** | `/api/v1/chat/completions` | 文本对话生成 |
| **ASR** | `/api/v1/audio/transcriptions` | 语音转文字 (支持文件上传) |
| **TTS** | `/api/v1/audio/speech` | 文字转语音 (返回音频流) |
| **Admin** | `/admin/*` | 系统状态、Token 及日志管理 |

## ⚙️ 配置文件
修改根目录下的 `config.py` 来配置模型路径、数据库连接及模型自动卸载时长。

---

*Built with ❤️ by Antigravity*
