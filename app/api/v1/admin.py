from fastapi import APIRouter, HTTPException
from app.core.database import db
from pydantic import BaseModel

router = APIRouter(prefix="/v1/admin")

class TokenCreate(BaseModel):
    name: str

@router.get("/stats")
async def get_stats():
    return db.get_stats()

@router.get("/models")
async def get_models():
    # 动态返回支持的模型及其元数据
    return {
        "chat": ["qwen", "llama3", "glm4", "mistral"],
        "audio": {
            "asr": ["sensevoice", "qwen", "whisper"],
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
