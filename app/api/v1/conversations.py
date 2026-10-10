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


# ---------------- Voice Provider Configs (三方 ASR/TTS 供应商) ----------------

class VoiceProviderUpsert(BaseModel):
    id: Optional[str] = None
    capability: str  # asr | tts
    provider: str = "openrouter"
    name: str
    base_url: str
    api_key: str
    model: str
    voice: Optional[str] = None
    enabled: Optional[bool] = True
    is_default: Optional[bool] = False


class VoiceProviderTest(BaseModel):
    base_url: str
    api_key: str


@router.get("/voice-providers")
async def list_voice_providers(capability: Optional[str] = None):
    return db.list_voice_provider_configs(capability)


@router.post("/voice-providers")
async def save_voice_provider(req: VoiceProviderUpsert):
    if req.capability not in ("asr", "tts"):
        raise HTTPException(status_code=400, detail="capability 必须为 asr 或 tts")
    cfg_id = req.id or str(uuid.uuid4())
    try:
        saved = db.save_voice_provider_config(
            cfg_id, req.capability, req.provider, req.name,
            req.base_url, req.api_key, req.model, req.voice,
            bool(req.enabled if req.enabled is not None else True),
            bool(req.is_default),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    saved["api_key"] = db._mask_api_key(saved["api_key"])
    return saved


@router.delete("/voice-providers/{cfg_id}")
async def delete_voice_provider(cfg_id: str):
    db.delete_voice_provider_config(cfg_id)
    return {"ok": True}


@router.post("/voice-providers/test")
async def test_voice_provider(req: VoiceProviderTest):
    """连通性测试：调用上游 /v1/models 验证 base_url + api_key。"""
    import httpx
    base = req.base_url.rstrip("/")
    models_url = f"{base}/models" if (base.endswith("/v1") or "/v1/" in base) else f"{base}/v1/models"
    key = req.api_key
    # 编辑态回显的是脱敏占位，需要用已存库中的真实 key（仅当带 id 保存过时才可能；测试按钮在保存后使用）
    if "•" in key:
        raise HTTPException(status_code=400, detail="请先填入完整 API Key 再测试")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(models_url, headers={"Authorization": f"Bearer {key}"})
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                return {"ok": True, "model_count": len(data)}
            return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


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
    preview_text: Optional[str] = Form(""),
    tts_model: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    ref_text: Optional[str] = Form(None),
    instruct: Optional[str] = Form(None),
    ref_audio_base64: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    import os
    voice_id = id or f"custom_{uuid.uuid4().hex[:8]}"

    # Check if voice already exists to preserve existing reference audio path
    existing = db.get_voice(voice_id)
    reference_audio_path = existing.get("reference_audio") if existing else None

    content = None
    filename = None
    if file:
        content = await file.read()
        filename = file.filename
    elif ref_audio_base64:
        import base64
        ref_data = ref_audio_base64
        if "," in ref_data:
            ref_data = ref_data.split(",", 1)[1]
        try:
            content = base64.b64decode(ref_data)
        except Exception as e:
            logger.error(f"Failed to decode ref_audio_base64: {e}")
            content = None

    if content:
        # Delete old file if it exists and is different
        if reference_audio_path and os.path.exists(reference_audio_path):
            try:
                os.remove(reference_audio_path)
            except:
                pass
        from config import CLONED_VOICES_DIR
        upload_dir = CLONED_VOICES_DIR
        os.makedirs(upload_dir, exist_ok=True)
        target_wav_path = os.path.join(upload_dir, f"{voice_id}.wav")

        import shutil
        import subprocess
        import tempfile
        normalized = False
        if shutil.which("ffmpeg"):
            with tempfile.NamedTemporaryFile(delete=False) as raw_tmp:
                raw_tmp.write(content)
                raw_tmp_path = raw_tmp.name
            try:
                cmd = [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-i", raw_tmp_path,
                    "-c:a", "pcm_s16le",
                    target_wav_path
                ]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if res.returncode == 0 and os.path.exists(target_wav_path) and os.path.getsize(target_wav_path) > 0:
                    normalized = True
                    reference_audio_path = target_wav_path
            finally:
                if os.path.exists(raw_tmp_path):
                    try:
                        os.remove(raw_tmp_path)
                    except:
                        pass

        if not normalized:
            file_ext = os.path.splitext(filename or "")[-1] or ".wav"
            reference_audio_path = os.path.join(upload_dir, f"{voice_id}{file_ext}")
            with open(reference_audio_path, "wb") as f:
                f.write(content)

    saved = db.save_custom_voice(
        voice_id=voice_id,
        name=name,
        description=description,
        tts_provider=tts_provider,
        tts_voice=tts_voice,
        reference_audio=reference_audio_path,
        language=language,
        preview_text=preview_text or None,
        tts_model=tts_model or None,
        gender=gender or None,
        ref_text=ref_text or None,
        instruct=instruct or None
    )
    return saved


@router.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    success = db.delete_voice(voice_id)
    if not success:
        raise HTTPException(status_code=400, detail="音色不存在")
    return {"ok": True}

