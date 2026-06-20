import os
from config import HF_HOME, HF_ENDPOINT
# 必须在导入任何 huggingface 相关的库之前设置环境变量
os.environ["HF_HOME"] = HF_HOME
os.environ["HF_ENDPOINT"] = HF_ENDPOINT

import logging
import json
import time
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("VoxLab")

from app.core.database import db

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Pre-warming models...")
    from app.core.model_manager import model_manager
    try:
        # 预热 ASR
        model_manager.get_model("iic/SenseVoiceSmall")
        logger.info("SenseVoice pre-warmed.")
        # 预热 TTS
        from app.providers.tts.qwen_tts_provider import QwenTTSProvider
        QwenTTSProvider()
        logger.info("QwenTTS pre-warmed.")
    except Exception as e:
        logger.error(f"Pre-warm failed: {e}")
    yield

app = FastAPI(title="VoxLab AI Server", lifespan=lifespan)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 鉴权与日志中间件 ---
@app.middleware("http")
async def auth_and_log_middleware(request: Request, call_next):
    path = request.url.path
    
    # 仅记录对外 API 接口；内部 /admin/* 管理类不进日志
    start_time = time.time()
    if not path.startswith("/api/") or path.startswith("/admin"):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ")[1] if auth_header.startswith("Bearer ") else ""
    
    # 检查是否是本地请求，如果是则免鉴权
    client_host = request.client.host
    is_local = client_host in ("127.0.0.1", "localhost", "::1")

    if not is_local and not db.verify_token(token):
        return JSONResponse(status_code=401, content={"error": "Unauthorized: Invalid or missing API Key"})

    response = await call_next(request)

    # 模型名从响应头 X-Model-Name 读取（route 显式设置），
    # 避免 request.state 在 BaseHTTPMiddleware 跨 call_next 任务不传递的问题
    model_name = response.headers.get("x-model-name") or "unknown"
    duration = time.time() - start_time
    
    # 统计 Token
    p_tokens, c_tokens, t_tokens = 0, 0, 0
    if "application/json" in response.headers.get("Content-Type", ""):
        if not getattr(response, "is_stream", False):
            try:
                body_content = getattr(response, "body", b"")
                if body_content:
                    resp_data = json.loads(body_content)
                    usage = resp_data.get("usage", {})
                    p_tokens, c_tokens, t_tokens = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), usage.get("total_tokens", 0)
            except: pass

    db.log_usage(token, str(model_name), path, response.status_code, duration, p_tokens, c_tokens, t_tokens)
    return response

# --- 注册 API 路由 ---
from app.api.v1 import audio as audio_v1          # TTS HTTP 接口
from app.api.v1 import asr as asr_v1              # ASR + VAD HTTP 接口
from app.api.v1 import agent_ws as agent_ws_v1    # WebSocket 实时对话
from app.api.v1 import admin as admin_v1
from app.api.v1 import voiceprint as voiceprint_v1
from app.api.v1 import chat as chat_v1
from app.api.v1 import conversations as conversations_v1
app.include_router(audio_v1.router)
app.include_router(asr_v1.router)
app.include_router(agent_ws_v1.router)
app.include_router(admin_v1.router)
app.include_router(voiceprint_v1.router)
app.include_router(chat_v1.router)
app.include_router(conversations_v1.router)

@app.get("/health")
async def health():
    return {"status": "ok"}

# --- 挂载前端页面 ---
STATIC_DIR = os.path.join(os.path.dirname(__file__), "dashboard", "out")
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

if DEV_MODE:
    import httpx
    from fastapi.responses import StreamingResponse
    
    # 全局代理客户端
    proxy_client = httpx.AsyncClient(base_url="http://127.0.0.1:7898", timeout=None)

    logger.info("Running in DEV_MODE: Proxying frontend to http://127.0.0.1:7898")
    
    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
    async def proxy_frontend(path: str, request: Request):
        # 只有当路径不以 api/、admin/ 或 v1/ 开头时才代理到前端开发服务器
        # 这些路径如果走到这里，说明之前的 API 路由都没匹配上
        if path.startswith("api/") or path.startswith("admin/") or path.startswith("v1/"):
            return JSONResponse(status_code=404, content={"detail": f"API Route //{path} not found in this instance"})
            
        url = f"/{path}"
        # 仅在非 GET/HEAD 请求时尝试读取 body
        content = None
        if request.method not in ("GET", "HEAD"):
            content = await request.body()

        rp_req = proxy_client.build_request(
            request.method, url,
            headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
            params=request.query_params,
            content=content
        )
        
        try:
            rp_resp = await proxy_client.send(rp_req, stream=True)
            return StreamingResponse(
                rp_resp.aiter_raw(),
                status_code=rp_resp.status_code,
                headers=dict(rp_resp.headers),
                background=None
            )
        except Exception as e:
            logger.error(f"Proxy error: {e}", exc_info=True)
            return JSONResponse(status_code=502, content={"detail": "Upstream error"})

elif os.path.exists(STATIC_DIR):
    app.mount("/_next", StaticFiles(directory=os.path.join(STATIC_DIR, "_next")), name="next_assets")
    @app.get("/")
    async def index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static_files")
else:
    @app.get("/")
    async def index():
        return {"message": "Dashboard 尚未编译。请执行 npm run build", "api_docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    # 开发模式下开启 reload
    if os.getenv("DEV_MODE", "false").lower() == "true":
        uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
    else:
        uvicorn.run(app, host="0.0.0.0", port=8001)
