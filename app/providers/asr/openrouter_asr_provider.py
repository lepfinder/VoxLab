"""OpenRouter ASR provider：走 OpenAI 兼容的 /v1/audio/transcriptions 端点。"""
import io
import logging
import os

import httpx

from app.core.database import db
from app.providers.base import BaseProvider

logger = logging.getLogger(__name__)

RETRY_STATUS = (429, 500, 502, 503, 504)


class OpenRouterASRProvider(BaseProvider):
    def load(self):
        return None  # Cloud API, no local model

    @staticmethod
    def _endpoint(base_url: str) -> str:
        base = base_url.rstrip("/")
        if base.endswith("/v1") or "/v1/" in base:
            return f"{base}/audio/transcriptions"
        return f"{base}/v1/audio/transcriptions"

    async def transcribe(self, file_path: str, want_timestamps: bool = False) -> dict:
        cfg = db.get_default_voice_provider_config("asr")
        if not cfg:
            raise RuntimeError("未配置启用的语音供应商（ASR），请先在 系统配置 → 语音供应商 中添加")

        endpoint = self._endpoint(cfg["base_url"])
        headers = {"Authorization": f"Bearer {cfg['api_key']}"}
        payload = {
            "model": cfg["model"],
            "response_format": "verbose_json" if want_timestamps else "json",
        }
        suffix = os.path.splitext(file_path)[1].lstrip(".") or "webm"
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        timeout = httpx.Timeout(60.0, connect=10.0)
        last_err = None
        for attempt in (1, 2):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        endpoint,
                        headers=headers,
                        data=payload,
                        files={"file": (f"audio.{suffix}", file_bytes, f"audio/{suffix}")},
                    )
                    if resp.status_code in RETRY_STATUS and attempt == 1:
                        last_err = f"upstream {resp.status_code}: {resp.text[:200]}"
                        logger.warning(f"[OpenRouterASR] retrying. {last_err}")
                        continue
                    if resp.status_code != 200:
                        raise RuntimeError(f"OpenRouter ASR error {resp.status_code}: {resp.text[:300]}")
                    data = resp.json()
            except httpx.HTTPError as e:
                last_err = str(e)
                if attempt == 2:
                    raise RuntimeError(f"OpenRouter ASR request failed: {e}")
                logger.warning(f"[OpenRouterASR] network error, retrying: {e}")
                continue

            if want_timestamps:
                return {
                    "text": data.get("text", ""),
                    "language": data.get("language", "zh"),
                    "segments": data.get("segments"),
                    "words": data.get("words"),
                }
            return {"text": data.get("text", ""), "language": data.get("language", "zh")}

        raise RuntimeError(f"OpenRouter ASR failed: {last_err}")
