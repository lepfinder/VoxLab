"""对话演示与 LLM 配置的 CRUD 路由。"""
import uuid
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.core.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["conversations"])


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


@router.get("/llm/configs/{cfg_id}/models")
async def list_config_models(cfg_id: str):
    cfg = db.get_llm_config(cfg_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="LLM config not found")
    from app.providers.llm.openai_compat import OpenAICompatClient
    client = OpenAICompatClient(
        base_url=cfg["base_url"],
        api_key=cfg["api_key"],
        model=cfg["model"],
    )
    models = await client.list_models()
    
    # 动态兜底逻辑：如果外部接口没有返回，或者为空，则根据 base_url/配置名称 进行常用模型预测内置
    if not models:
        url_lower = cfg["base_url"].lower()
        name_lower = cfg["name"].lower()
        
        # 1. 阿里云通义千问 (DashScope)
        if "aliyuncs.com" in url_lower or "qwen" in url_lower or "aliyun" in name_lower or "阿里" in name_lower:
            models = ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long"]
            
        # 2. 字节跳动火山引擎方舟 (Volcengine Ark)
        elif "volces.com" in url_lower or "volcengine" in url_lower or "fangzhou" in name_lower or "火山" in name_lower or "方舟" in name_lower:
            # 火山通常需要用户在后台自定义推理接入点端点(endpoint)，预置几个常用的标准参考名，方便引导用户
            models = ["doubao-pro-4k", "doubao-pro-32k", "doubao-lite-4k", "doubao-lite-32k"]
            
        # 3. 硅基流动 (SiliconFlow)
        elif "siliconflow" in url_lower or "硅基" in name_lower:
            models = [
                "deepseek-ai/DeepSeek-V3", 
                "deepseek-ai/DeepSeek-R1", 
                "Qwen/Qwen2.5-72B-Instruct", 
                "Qwen/Qwen2.5-7B-Instruct",
                "THUDM/glm-4-9b-chat"
            ]
            
        # 4. 官方 DeepSeek
        elif "deepseek" in url_lower or "deepseek" in name_lower:
            models = ["deepseek-chat", "deepseek-reasoner"]

    # 5. 始终把该配置已经配置的 model 塞入列表中，确保至少有一个可用项
    if cfg.get("model") and cfg["model"] not in models:
        models.insert(0, cfg["model"])
        
    return {"models": models}


# ---------------- Speakers (发音人) ----------------

class SpeakerUpsert(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    avatar: Optional[str] = "default"
    system_prompt: str
    voice_id: str
    llm_config_id: Optional[str] = None
    llm_model: Optional[str] = None


@router.get("/speakers")
async def list_speakers():
    return db.list_speakers()


@router.post("/speakers")
async def save_speaker(req: SpeakerUpsert):
    sp_id = req.id or str(uuid.uuid4())
    saved = db.save_speaker(
        sp_id,
        req.name,
        req.description,
        req.avatar,
        req.system_prompt,
        req.voice_id,
        req.llm_config_id,
        req.llm_model
    )
    return saved


@router.delete("/speakers/{sp_id}")
async def delete_speaker(sp_id: str):
    success = db.delete_speaker(sp_id)
    if not success:
        raise HTTPException(status_code=400, detail="预置发音人不能被删除")
    return {"ok": True}


@router.get("/voices")
async def list_voices():
    return db.list_voices()


@router.post("/voices")
async def save_custom_voice(
    id: Optional[str] = Form(None),
    name: str = Form(...),
    description: Optional[str] = Form(""),
    tts_provider: str = Form(...),
    tts_voice: str = Form(...),
    language: Optional[str] = Form("zh"),
    file: Optional[UploadFile] = File(None)
):
    import os
    voice_id = id or f"custom_{uuid.uuid4().hex[:8]}"
    
    # Check if voice already exists to preserve existing reference audio path
    existing = db.get_voice(voice_id)
    reference_audio_path = existing.get("reference_audio") if existing else None
    
    if file:
        # Delete old file if it exists and is different
        if reference_audio_path and os.path.exists(reference_audio_path):
            try:
                os.remove(reference_audio_path)
            except:
                pass
        upload_dir = "data/cloned_voices"
        os.makedirs(upload_dir, exist_ok=True)
        file_ext = os.path.splitext(file.filename)[-1] or ".wav"
        reference_audio_path = os.path.join(upload_dir, f"{voice_id}{file_ext}")
        with open(reference_audio_path, "wb") as f:
            content = await file.read()
            f.write(content)
            
    saved = db.save_custom_voice(
        voice_id=voice_id,
        name=name,
        description=description,
        tts_provider=tts_provider,
        tts_voice=tts_voice,
        reference_audio=reference_audio_path,
        language=language
    )
    return saved


@router.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    success = db.delete_voice(voice_id)
    if not success:
        raise HTTPException(status_code=400, detail="预置音色不能被删除或音色不存在")
    return {"ok": True}

