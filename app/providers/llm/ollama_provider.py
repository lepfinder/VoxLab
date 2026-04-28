import httpx
import json
import logging
from app.providers.base import BaseProvider
from config import OLLAMA_BASE_URL

logger = logging.getLogger(__name__)

class OllamaProvider(BaseProvider):
    def __init__(self):
        # Ollama 自带了兼容 OpenAI 的接口地址
        self.base_url = f"{OLLAMA_BASE_URL}/v1/chat/completions"

    def load(self):
        return None # Ollama 是独立进程，无需加载

    async def chat_completions(self, payload: dict):
        """
        转发请求到 Ollama，支持流式和非流式
        """
        async with httpx.AsyncClient(timeout=None) as client:
            if payload.get("stream"):
                return self._stream_request(client, payload)
            else:
                return await self._normal_request(client, payload)

    async def _normal_request(self, client, payload):
        response = await client.post(self.base_url, json=payload)
        return response.json()

    async def _stream_request(self, client, payload):
        async with client.stream("POST", self.base_url, json=payload) as response:
            async for line in response.aiter_lines():
                if line:
                    yield line
