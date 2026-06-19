"""OpenAI 兼容 LLM 客户端（支持 DeepSeek 等 OpenAI 协议供应商）。"""
import logging
from typing import AsyncIterator, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class OpenAICompatClient:
    """对 OpenAI 风格 /v1/chat/completions 的最小封装。"""

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 120.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    @property
    def _endpoint(self) -> str:
        # 若上游已显式包含 /v1，则直接拼接，否则自动补全
        if self.base_url.endswith("/v1") or "/v1/" in self.base_url:
            return f"{self.base_url}/chat/completions"
        return f"{self.base_url}/v1/chat/completions"

    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        extra: Optional[Dict] = None,
    ) -> AsyncIterator[Dict]:
        """流式调用上游，按 SSE chunk 字典迭代。每个 chunk 形如：
        {"choices": [{"delta": {"content": "..."}, "finish_reason": None}]}
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if extra:
            payload.update(extra)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout)) as client:
            async with client.stream("POST", self._endpoint, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise RuntimeError(
                        f"LLM upstream error {resp.status_code}: {body.decode('utf-8', errors='ignore')}"
                    )
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        import json
                        yield json.loads(data)
                    except Exception as e:
                        logger.warning(f"Failed to parse SSE chunk: {data!r} ({e})")
