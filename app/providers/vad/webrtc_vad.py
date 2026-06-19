import numpy as np
import webrtcvad
from app.providers.vad.base import BaseVADProvider

class WebRTCVADProvider(BaseVADProvider):
    def __init__(self, mode: int = 2, frame_duration_ms: int = 30, padding_duration_ms: int = 300):
        """
        :param mode: 敏感度级别 (0: 最不敏感, 3: 最敏感/最激进地判定为人声)
        :param frame_duration_ms: 帧长，必须是 10, 20 或 30 毫秒
        :param padding_duration_ms: 平滑过渡缓冲时长（毫秒）
        """
        self.vad = webrtcvad.Vad(mode)
        self.frame_duration = frame_duration_ms
        self.padding_duration = padding_duration_ms

    def segments(self, audio_data: np.ndarray, sample_rate: int = 16000) -> list[dict]:
        if sample_rate not in (8000, 16000, 32000, 48000):
            raise ValueError("WebRTC VAD only supports sample rates: 8000, 16000, 32000, 48000 Hz")
        if self.frame_duration not in (10, 20, 30):
            raise ValueError("WebRTC VAD only supports frame durations: 10, 20, 30 ms")

        # 转换 float32 numpy 数组为 16-bit PCM bytes
        pcm_data = (np.clip(audio_data, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
        
        # 每帧的字节数: 2 字节/样本
        frame_size = int(sample_rate * (self.frame_duration / 1000.0))
        frame_bytes_len = frame_size * 2

        if frame_bytes_len <= 0 or len(pcm_data) < frame_bytes_len:
            return []

        num_frames = len(pcm_data) // frame_bytes_len
        is_speech = []

        for i in range(num_frames):
            frame_bytes = pcm_data[i * frame_bytes_len : (i + 1) * frame_bytes_len]
            try:
                active = self.vad.is_speech(frame_bytes, sample_rate)
                is_speech.append(active)
            except Exception:
                is_speech.append(False)

        # 状态机平滑
        hangover_frames = int(self.padding_duration / self.frame_duration)
        smoothed_speech = []
        silence_counter = 0
        active = False

        for speech_active in is_speech:
            if speech_active:
                active = True
                silence_counter = 0
            else:
                if active:
                    silence_counter += 1
                    if silence_counter > hangover_frames:
                        active = False
            smoothed_speech.append(active)

        # 提取时间段
        segments = []
        in_segment = False
        start_time = 0.0

        for idx, active in enumerate(smoothed_speech):
            current_time = (idx * frame_size) / sample_rate
            if active and not in_segment:
                in_segment = True
                start_time = current_time
            elif not active and in_segment:
                in_segment = False
                segments.append({"start": round(start_time, 2), "end": round(current_time, 2)})

        if in_segment:
            total_duration = len(audio_data) / sample_rate
            segments.append({"start": round(start_time, 2), "end": round(total_duration, 2)})

        return segments
