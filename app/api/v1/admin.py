import os
import glob
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from app.core.database import db
from pydantic import BaseModel

router = APIRouter(prefix="/v1/admin")

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
    return db.get_usage_logs(limit)


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
