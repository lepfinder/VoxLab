"""对话演示与 LLM 配置的 CRUD 路由。"""
import uuid
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["conversations"])


# ---------------- Conversation ----------------

class ConversationCreate(BaseModel):
    title: Optional[str] = "新对话"


class ConversationRename(BaseModel):
    title: str


@router.get("/conversations")
async def list_conversations():
    return db.list_conversations()


@router.post("/conversations")
async def create_conversation(req: ConversationCreate):
    conv = db.create_conversation(str(uuid.uuid4()), req.title)
    return conv


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    conv = db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="conversation not found")
    messages = db.list_messages(conv_id)
    return {"conversation": conv, "messages": messages}


@router.patch("/conversations/{conv_id}")
async def rename_conversation(conv_id: str, req: ConversationRename):
    conv = db.rename_conversation(conv_id, req.title)
    if not conv:
        raise HTTPException(status_code=404, detail="conversation not found")
    return conv


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    db.delete_conversation(conv_id)
    return {"ok": True}


# ---------------- LLM Config ----------------

class LLMConfigUpsert(BaseModel):
    id: Optional[str] = None
    name: str
    base_url: str
    api_key: str
    model: str
    temperature: Optional[float] = 0.7
    is_default: Optional[bool] = False


@router.get("/llm/configs")
async def list_llm_configs():
    return db.list_llm_configs()


@router.get("/llm/configs/default")
async def get_default_llm_config():
    cfg = db.get_default_llm_config()
    if cfg:
        cfg["api_key"] = db._mask_api_key(cfg["api_key"])
    return cfg or {}


@router.post("/llm/configs")
async def save_llm_config(req: LLMConfigUpsert):
    cfg_id = req.id or str(uuid.uuid4())
    saved = db.save_llm_config(
        cfg_id,
        req.name,
        req.base_url,
        req.api_key,
        req.model,
        req.temperature or 0.7,
        bool(req.is_default),
    )
    saved["api_key"] = db._mask_api_key(saved["api_key"])
    return saved


@router.delete("/llm/configs/{cfg_id}")
async def delete_llm_config(cfg_id: str):
    db.delete_llm_config(cfg_id)
    return {"ok": True}
