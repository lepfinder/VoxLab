"""OpenAI 兼容的 /api/v1/chat/completions 路由。
将请求转发到数据库里配置的 LLM 供应商（默认 DeepSeek）。
"""
import json
import time
import uuid
import logging
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.database import db
from app.providers.llm.openai_compat import OpenAICompatClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = None  # 选填，未填则用默认 config 的 model
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    stream: Optional[bool] = True
    conversation_id: Optional[str] = None  # 可选，用于持久化多轮上下文


@router.post("/chat/completions")
async def chat_completions(req: ChatCompletionRequest, request: Request):
    start_time = time.time()

    # 提取 token（用于日志）
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ")[1] if auth_header.startswith("Bearer ") else ""

    # 选 config：默认或前端指定
    config = db.get_default_llm_config()
    if not config:
        raise HTTPException(
            status_code=400,
            detail="尚未配置 LLM 供应商，请先在侧边栏「LLM 配置」里添加。",
        )

    client = OpenAICompatClient(
        base_url=config["base_url"],
        api_key=config["api_key"],
        model=req.model or config["model"],
    )

    request.state.model_name = client.model

    messages_payload = [{"role": m.role, "content": m.content} for m in req.messages]
    messages_json = json.dumps(messages_payload, ensure_ascii=False)

    # 如果提供了 conversation_id，把用户最新的消息入库
    user_text = ""
    for m in reversed(req.messages):
        if m.role == "user":
            user_text = m.content
            break
    if req.conversation_id and user_text:
        if db.get_conversation(req.conversation_id):
            db.add_message(
                str(uuid.uuid4()), req.conversation_id, "user", user_text, 0
            )

    async def stream_generator():
        full_text = []
        thinking_parts = []
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        finish_reason = ""
        error_msg = None
        status_code = 200

        try:
            async for chunk in client.stream_chat(
                messages_payload, temperature=req.temperature or 0.7
            ):
                # usage 信息（最后一个 chunk，需 stream_options.include_usage=True）
                if chunk.get("usage"):
                    usage = chunk["usage"]
                    prompt_tokens = usage.get("prompt_tokens", 0) or prompt_tokens
                    completion_tokens = usage.get("completion_tokens", 0) or completion_tokens
                    total_tokens = usage.get("total_tokens", 0) or total_tokens

                choices = chunk.get("choices") or []
                if not choices:
                    continue

                delta = choices[0].get("delta", {}) or {}

                # 正常内容
                content = delta.get("content")
                if content:
                    full_text.append(content)

                # 思考过程（DeepSeek-R1、QwQ 等推理模型）
                reasoning = delta.get("reasoning_content")
                if reasoning:
                    thinking_parts.append(reasoning)

                # 结束原因
                fr = choices[0].get("finish_reason")
                if fr:
                    finish_reason = fr

                # 透传 OpenAI 风格的 SSE
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
            status_code = 500
            error_msg = str(e)
            logger.error(f"LLM streaming failed: {e}")
            err_payload = {"error": {"message": error_msg, "type": "upstream_error"}}
            yield f"data: {json.dumps(err_payload, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        finally:
            # 记录 LLM 日志
            final_text = "".join(full_text)
            thinking_text = "".join(thinking_parts)
            duration = time.time() - start_time

            try:
                db.log_llm(
                    token=token,
                    model=client.model,
                    endpoint="/api/v1/chat/completions",
                    status_code=status_code,
                    duration=duration,
                    messages=messages_json,
                    response=final_text,
                    thinking=thinking_text,
                    finish_reason=finish_reason,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                )
            except Exception as log_err:
                logger.error(f"Failed to log LLM request: {log_err}")

            # 持久化 assistant 消息
            if req.conversation_id and final_text and not error_msg:
                if db.get_conversation(req.conversation_id):
                    db.add_message(
                        str(uuid.uuid4()),
                        req.conversation_id,
                        "assistant",
                        final_text,
                        total_tokens,
                    )

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "X-Model-Name": client.model},
    )
