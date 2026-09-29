"""OpenRouter TTS provider：走 OpenAI 兼容的 /v1/audio/speech 端点。"""
import io
import logging

import httpx

from app.core.database import db
from app.providers.base import BaseProvider

logger = logging.getLogger(__name__)

RETRY_STATUS = (429, 500, 502, 503, 504)


class OpenRouterTTSProvider(BaseProvider):
    def load(self):
        return None  # Cloud API, no local model

    @staticmethod
    def _endpoint(base_url: str) -> str:
        base = base_url.rstrip("/")
        if base.endswith("/v1") or "/v1/" in base:
            return f"{base}/audio/speech"
        return f"{base}/v1/audio/speech"

    @staticmethod
    def _config() -> dict:
        cfg = db.get_default_voice_provider_config("tts")
        if not cfg:
            raise RuntimeError("未配置启用的语音供应商（TTS），请先在 系统配置 → 语音供应商 中添加")
        return cfg

    def _request(self, text: str, voice: str, response_format: str, model: str = None):
        cfg = self._config()
        payload = {
            "model": model or cfg["model"],
            "input": text,
            "voice": voice or cfg.get("voice") or "alloy",
            "response_format": response_format,
        }
        headers = {
            "Authorization": f"Bearer {cfg['api_key']}",
            "Content-Type": "application/json",
        }
        return self._endpoint(cfg["base_url"]), payload, headers

    async def stream_bytes(self, text: str, voice: str = None, response_format: str = "mp3", model: str = None):
        """按到达顺序透传上游音频字节流（mp3 直出场景）。"""
        endpoint, payload, headers = self._request(text, voice, response_format, model)
        timeout = httpx.Timeout(120.0, connect=10.0)
        last_err = None
        for attempt in (1, 2):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", endpoint, json=payload, headers=headers) as resp:
                        if resp.status_code != 200:
                            body = await resp.aread()
                            err = f"OpenRouter TTS error {resp.status_code}: {body.decode('utf-8', errors='ignore')[:300]}"
                            if resp.status_code in RETRY_STATUS and attempt == 1:
                                last_err = err
                                logger.warning(f"[OpenRouterTTS] retrying. {err}")
                                continue
                            raise RuntimeError(err)
                        async for chunk in resp.aiter_bytes():
                            if chunk:
                                yield chunk
                        return
            except httpx.HTTPError as e:
                last_err = str(e)
                if attempt == 2:
                    raise RuntimeError(f"OpenRouter TTS request failed: {e}")
                logger.warning(f"[OpenRouterTTS] network error, retrying: {e}")
                continue
        raise RuntimeError(f"OpenRouter TTS failed: {last_err}")

    async def stream_generate(self, text: str, voice: str = None, model: str = None):
        """输出 16kHz 单声道 16-bit PCM 分块，供 Opus 编码管线消费。
        与 EdgeTTSProvider.stream_generate 行为一致：先取全量 MP3 再解码分块。
        """
        import librosa
        import numpy as np

        buf = b""
        async for chunk in self.stream_bytes(text, voice, response_format="mp3", model=model):
            buf += chunk
        if not buf:
            return
        with io.BytesIO(buf) as f:
            audio_data, sr = librosa.load(f, sr=16000)
        pcm_data = (np.clip(audio_data, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
        chunk_size = 4096
        for i in range(0, len(pcm_data), chunk_size):
            yield pcm_data[i:i + chunk_size]
