import edge_tts
from app.providers.base import BaseProvider

class EdgeTTSProvider(BaseProvider):
    def load(self):
        return None # Cloud API, no local model

    async def generate(self, text: str, voice: str = "zh-CN-XiaoxiaoNeural"):
        communicate = edge_tts.Communicate(text, voice)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return audio_data
