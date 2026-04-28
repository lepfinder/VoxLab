import logging
from fastapi import FastAPI
import gradio as gr
from webui import demo
from routes import vosk_api, sensevoice_api, edge_tts_api, kokoro_api, qwen_api, omni_api, voxcpm_api, voiceprint_api

# 配置日志格式
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("HomeCore")

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="HomeCore AI Server")

# 配置 CORS 中间件，允许 Tauri 前端 (localhost:1420) 跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在本地环境下允许所有来源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册各个功能模块的路由
app.include_router(vosk_api.router)
app.include_router(sensevoice_api.router)
app.include_router(edge_tts_api.router)
app.include_router(kokoro_api.router)
app.include_router(qwen_api.router)
app.include_router(omni_api.router)
app.include_router(voxcpm_api.router)
app.include_router(voiceprint_api.router)

@app.get("/health")
async def health():
    return {"status": "ok"}

# === 挂载 Web UI ===
app = gr.mount_gradio_app(app, demo, path="/webui")

if __name__ == "__main__":
    import uvicorn
    # 自定义 Uvicorn 日志配置以包含时间戳
    log_config = uvicorn.config.LOGGING_CONFIG
    log_config["formatters"]["access"]["fmt"] = "%(asctime)s - %(levelname)s - %(client_addr)s - '%(request_line)s' %(status_code)s"
    log_config["formatters"]["default"]["fmt"] = "%(asctime)s - %(levelname)s - %(message)s"
    log_config["formatters"]["access"]["datefmt"] = "%Y-%m-%d %H:%M:%S"
    log_config["formatters"]["default"]["datefmt"] = "%Y-%m-%d %H:%M:%S"

    uvicorn.run(app, host="0.0.0.0", port=8001, log_config=log_config)
