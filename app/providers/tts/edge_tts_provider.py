import edge_tts
from app.providers.base import BaseProvider

class EdgeTTSProvider(BaseProvider):
    def load(self):
        return None # Cloud API, no local model

    async def stream_generate(self, text: str, voice: str = "zh-CN-XiaoxiaoNeural"):
        try:
            import edge_tts
            import io
            import librosa
            import numpy as np

            # 验证声音名，如果包含 'serena' 或无效，则回退
            # 注意：edge-tts 的声音名通常是 zh-CN-XiaoxiaoNeural 这种格式
            if not voice or "serena" in voice.lower():
                voice = "zh-CN-XiaoxiaoNeural"

            communicate = edge_tts.Communicate(text, voice)
            audio_bytes = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_bytes += chunk["data"]
            
            # 由于 edge-tts 的流不是分片 PCM，我们先拿到全量 MP3 再解码为 PCM 流式发出
            # (或者也可以分段解码，但 MP3 分段解码比较复杂)
            if audio_bytes:
                with io.BytesIO(audio_bytes) as f:
                    audio_data, sr = librosa.load(f, sr=16000)
                    # 转换为 16-bit PCM
                    pcm_data = (audio_data * 32767).astype(np.int16).tobytes()
                    # 分块 yield
                    chunk_size = 4096
                    for i in range(0, len(pcm_data), chunk_size):
                        yield pcm_data[i:i+chunk_size]
        except Exception as e:
            logger.error(f"[EdgeTTS] Error: {e}")
            yield b""
