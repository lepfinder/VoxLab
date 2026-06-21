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
