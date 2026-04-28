from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas.openai import ChatCompletionRequest
from app.providers.llm.ollama_provider import OllamaProvider

from app.core.database import db
import time

router = APIRouter(prefix="/v1/chat")

ollama_provider = OllamaProvider()

@router.post("/completions")
async def chat_completions(request: ChatCompletionRequest):
    """
    OpenAI 兼容的对话接口，目前转发至本地 Ollama
    """
    payload = request.dict(exclude_none=True)
    
    try:
        if request.stream:
            # 返回流式响应 (SSE)
            return StreamingResponse(
                ollama_provider.chat_completions(payload),
                media_type="text/event-stream"
            )
        else:
            # 返回普通 JSON 响应
            return await ollama_provider.chat_completions(payload)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
