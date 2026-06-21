import os
import glob
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from app.core.database import db
from pydantic import BaseModel

router = APIRouter(prefix="/admin")

# 模型文档目录
DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "docs", "models")

class TokenCreate(BaseModel):
    name: str

@router.get("/stats")
async def get_stats():
    return db.get_stats()

@router.get("/models")
async def get_models():
    # 动态返回支持的模型及其元数据
    return {
        "audio": {
            "asr": ["sensevoice", "qwen", "vosk"],
            "tts": [
                {
                    "id": "kokoro",
                    "voices": ["serena", "vivian", "uncle_fu", "ryan", "aiden", "ono_anna", "sohee", "eric", "dylan"]
                },
                {
                    "id": "qwen",
                    "voices": ["serena", "vivian", "uncle_fu", "ryan", "aiden", "ono_anna", "sohee", "eric", "dylan"]
                },
                {
                    "id": "voxcpm",
                    "voices": ["default"]
                },
                {
                    "id": "omni",
                    "voices": ["default"]
                },
                {
                    "id": "edge-tts",
                    "voices": ["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural", "en-US-GuyNeural"]
                }
            ]
        }
    }

@router.get("/tokens")
async def list_tokens():
    return db.get_all_tokens()

@router.post("/tokens")
async def create_token(data: TokenCreate):
    token = db.add_token(data.name)
    return {"token": token}

@router.delete("/tokens/{token}")
async def delete_token(token: str):
    db.delete_token(token)
    return {"status": "deleted"}

@router.get("/logs")
async def list_logs(limit: int = 100):
    # 旧版通用日志，保留兼容；新数据已写入 asr_logs / tts_logs / llm_logs
    return db.get_usage_logs(limit)


@router.get("/logs/asr")
async def list_asr_logs(limit: int = 100):
    return db.get_asr_logs(limit)


@router.get("/logs/tts")
async def list_tts_logs(limit: int = 100):
    return db.get_tts_logs(limit)


@router.get("/logs/llm")
async def list_llm_logs(limit: int = 100):
    return db.get_llm_logs(limit)


# API 文档目录
API_DOCS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "docs", "API_DOCUMENTATION.md")

@router.get("/api-docs")
async def get_api_docs():
    """获取系统对外 API 接口文档（Markdown 格式）"""
    if not os.path.isfile(API_DOCS_PATH):
        raise HTTPException(status_code=404, detail="API documentation not found")
    with open(API_DOCS_PATH, 'r', encoding='utf-8') as f:
        return PlainTextResponse(content=f.read(), media_type="text/markdown; charset=utf-8")


# --- 模型文档接口 ---
@router.get("/docs")
async def list_model_docs():
    """列出所有可用的模型文档目录"""
    if not os.path.isdir(DOCS_DIR):
        return []
    models = []
    for item in sorted(os.listdir(DOCS_DIR)):
        item_path = os.path.join(DOCS_DIR, item)
        if os.path.isdir(item_path):
            files = [f for f in os.listdir(item_path) if f.endswith('.md')]
            models.append({"model": item, "files": sorted(files)})
    return models


@router.get("/docs/{model}/{filename}")
async def get_model_doc(model: str, filename: str):
    """获取指定模型的文档内容（Markdown 格式）"""
    # 安全检查：防止路径遍历
    if '..' in model or '..' in filename:
        raise HTTPException(status_code=400, detail="Invalid path")
    file_path = os.path.join(DOCS_DIR, model, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail=f"Document not found: {model}/{filename}")
    with open(file_path, 'r', encoding='utf-8') as f:
        return PlainTextResponse(content=f.read(), media_type="text/markdown; charset=utf-8")


# --- 系统级实战教程接口 ---
TUTORIALS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "docs", "tutorials")

@router.get("/tutorials")
async def list_tutorials():
    """扫描 docs/tutorials 目录，返回两级嵌套 JSON"""
    if not os.path.isdir(TUTORIALS_DIR):
        return []
    
    chapters = []
    # 获取所有 chapter 目录
    for item in sorted(os.listdir(TUTORIALS_DIR)):
        item_path = os.path.join(TUTORIALS_DIR, item)
        if os.path.isdir(item_path) and item.startswith("chapter"):
            chapter_title = ""
            if "theory" in item:
                chapter_title = "第 1 章：声学与语音 AI 原理基础"
            elif "hardware" in item:
                chapter_title = "第 2 章：ESP32 硬件与 WebSocket 对接"
            elif "practice" in item:
                chapter_title = "第 3 章：AI 语音应用实战演练"
            else:
                chapter_title = item.replace("_", " ").title()


            sections = []
            # 获取目录下的所有 .md 文件
            for file_name in sorted(os.listdir(item_path)):
                if file_name.endswith(".md"):
                    file_path = os.path.join(item_path, file_name)
                    sec_title = file_name.replace(".md", "").replace("_", " ").title()
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            first_line = f.readline().strip()
                            if first_line.startswith("# "):
                                sec_title = first_line.lstrip("# ").strip()
                    except Exception:
                        pass
                    
                    sections.append({
                        "id": file_name.replace(".md", ""),
                        "title": sec_title
                    })
            
            chapters.append({
                "id": item,
                "title": chapter_title,
                "sections": sections
            })
    
    return chapters


@router.get("/tutorials/{chapter_id}/{section_id}")
async def get_tutorial_section(chapter_id: str, section_id: str):
    """读取指定小节的 Markdown 内容"""
    if '..' in chapter_id or '..' in section_id:
        raise HTTPException(status_code=400, detail="Invalid path")
        
    file_path = os.path.join(TUTORIALS_DIR, chapter_id, f"{section_id}.md")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail=f"Section not found: {chapter_id}/{section_id}")
        
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return PlainTextResponse(content=content, media_type="text/markdown; charset=utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 系统自检与模型下载管理 ---
import socket
import platform
import sys
import threading
from urllib.parse import urlparse
from config import MODELS, HF_HOME, HF_ENDPOINT

# 全局模型异步下载任务状态记录
DOWNLOAD_TASKS = {}  # model_id -> {"status": "idle"|"downloading"|"success"|"failed", "log": str, "error": str}

def check_model_status(model_key: str, model_id: str) -> dict:
    """离线扫描检查 Hugging Face 本地缓存模型就绪状态及大小"""
    # 特殊处理 vosk（它不通过 Hugging Face 镜像）
    if model_key == "vosk":
        vosk_path = os.path.expanduser(f"~/.cache/vosk/{model_id}")
        local_exist = os.path.exists(vosk_path) or os.path.exists(model_id)
        return {
            "status": "installed" if local_exist else "missing",
            "path": vosk_path if local_exist else None,
            "size": "45 MB" if local_exist else "0 MB"
        }

    # 特殊处理 ModelScope / funasr 模型（它们默认下载到 modelscope 缓存目录而非 huggingface）
    if "iic/" in model_id:
        ms_cache = os.getenv("MODELSCOPE_CACHE", os.path.expanduser("~/.cache/modelscope"))
        model_path = os.path.join(ms_cache, "hub", "models", model_id)
        if os.path.exists(model_path) and os.listdir(model_path):
            total_size = 0
            for dirpath, dirnames, filenames in os.walk(model_path):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    if not os.path.islink(fp):
                        try:
                            total_size += os.path.getsize(fp)
                        except:
                            pass
            size_mb = total_size / (1024 * 1024)
            size_str = f"{size_mb:.1f} MB" if size_mb < 1024 else f"{size_mb/1024:.2f} GB"
            return {
                "status": "installed",
                "path": model_path,
                "size": size_str
            }
        else:
            return {
                "status": "missing",
                "path": None,
                "size": "0 MB"
            }

    folder_name = f"models--{model_id.replace('/', '--')}"
    model_dir = os.path.join(HF_HOME, "hub", folder_name)
    snapshots_dir = os.path.join(model_dir, "snapshots")
    
    if os.path.exists(snapshots_dir) and os.listdir(snapshots_dir):
        # 扫描出快照目录名
        snapshots = os.listdir(snapshots_dir)
        snapshot_path = os.path.join(snapshots_dir, snapshots[0])
        
        # 扫描文件夹总大小（跳过软连接防止重复计算）
        total_size = 0
        for dirpath, dirnames, filenames in os.walk(snapshot_path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    try:
                        total_size += os.path.getsize(fp)
                    except:
                        pass
        size_mb = total_size / (1024 * 1024)
        size_str = f"{size_mb:.1f} MB" if size_mb < 1024 else f"{size_mb/1024:.2f} GB"
        
        return {
            "status": "installed",
            "path": snapshot_path,
            "size": size_str
        }
    else:
        # 检查是否正在下载
        current_task = DOWNLOAD_TASKS.get(model_id, {})
        if current_task.get("status") == "downloading":
            return {
                "status": "downloading",
                "path": None,
                "size": "0 MB"
            }
        return {
            "status": "missing",
            "path": None,
            "size": "0 MB"
        }

def bg_download_model_task(model_id: str):
    """后台下载线程任务"""
    from huggingface_hub import snapshot_download
    
    DOWNLOAD_TASKS[model_id]["status"] = "downloading"
    DOWNLOAD_TASKS[model_id]["log"] += "正在发起连接，检测可用加速端点...\n"
    
    try:
        # 执行下载
        local_path = snapshot_download(model_id, endpoint=HF_ENDPOINT)
        DOWNLOAD_TASKS[model_id]["status"] = "success"
        DOWNLOAD_TASKS[model_id]["log"] += f"下载完成！模型已成功保存至:\n{local_path}\n"
    except Exception as e:
        DOWNLOAD_TASKS[model_id]["status"] = "failed"
        DOWNLOAD_TASKS[model_id]["error"] = str(e)
        DOWNLOAD_TASKS[model_id]["log"] += f"下载失败，出现异常: {e}\n"

@router.get("/system/check")
async def system_check():
    """获取系统运行环境和模型状态"""
    # 1. 快速检查网络端点连通性
    host = urlparse(HF_ENDPOINT).hostname or "hf-mirror.com"
    online = False
    try:
        socket.create_connection((host, 443), timeout=1.0)
        online = True
    except:
        pass

    # 2. 探知运行设备
    import torch
    if torch.cuda.is_available():
        device = "CUDA (NVIDIA GPU Acceleration)"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = "MPS (Apple Silicon Metal Acceleration)"
    else:
        device = "CPU Only"

    # 3. 收集环境元数据
    system_info = {
        "os": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "device": device,
        "python_version": sys.version.split(" ")[0],
        "hf_home": HF_HOME,
        "hf_endpoint": HF_ENDPOINT,
        "network_status": "connected" if online else "offline"
    }

    # 4. 扫描所有模型的就绪情况
    model_status_list = []
    # 剔除 voiceprint 等非主流程大模型，列出主要的 ASR 和 TTS 模型
    main_models = {
        "sensevoice": "SenseVoice (语音识别/ASR)",
        "qwen_asr": "Qwen ASR (语音识别/ASR)",
        "vosk": "Vosk CN Model (语音识别/ASR)",
        "kokoro": "Kokoro (轻量文本转语音/TTS)",
        "qwen_tts_design": "Qwen TTS VoiceDesign (个性化文本转语音/TTS)",
        "qwen_tts_custom": "Qwen TTS CustomVoice (预设音色文本转语音/TTS)",
        "qwen_tts_base": "Qwen TTS Base (声音克隆文本转语音/TTS)",
        "omni_voice": "OmniVoice (语气定制文本转语音/TTS)",
        "vox_cpm": "VoxCPM (情感控制文本转语音/TTS)"
    }

    for key, displayName in main_models.items():
        if key in MODELS:
            model_id = MODELS[key]
            status = check_model_status(key, model_id)
            model_status_list.append({
                "key": key,
                "name": displayName,
                "model_id": model_id,
                "status": status["status"],
                "path": status["path"],
                "size": status["size"],
                "download_command": f"huggingface-cli download {model_id}" if key != "vosk" else "mkdir -p ~/.cache/vosk && wget https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"
            })

    return {
        "system": system_info,
        "models": model_status_list
    }

class DownloadRequest(BaseModel):
    model_id: str

@router.post("/system/download")
async def start_download(req: DownloadRequest):
    """异步开始下载特定的模型"""
    model_id = req.model_id
    if not model_id:
        raise HTTPException(status_code=400, detail="Missing model_id")

    # 如果已经在下载，不重复触发
    if model_id in DOWNLOAD_TASKS and DOWNLOAD_TASKS[model_id]["status"] == "downloading":
        return {"status": "already_downloading", "message": "该模型已经在下载队列中"}

    # 初始化任务状态
    DOWNLOAD_TASKS[model_id] = {
        "status": "idle",
        "log": f"开始下载模型 {model_id} ...\n",
        "error": ""
    }

    # 启动后台线程异步下载
    t = threading.Thread(target=bg_download_model_task, args=(model_id,))
    t.start()

    return {"status": "started", "message": "模型后台下载任务已启动"}

@router.get("/system/download/progress")
async def download_progress(model_id: str):
    """轮询获取模型下载状态与控制台日志"""
    if model_id not in DOWNLOAD_TASKS:
        return {"status": "idle", "log": "无下载任务记录", "error": ""}
    return DOWNLOAD_TASKS[model_id]
