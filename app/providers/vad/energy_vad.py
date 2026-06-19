import numpy as np
from app.providers.vad.base import BaseVADProvider

class EnergyVADProvider(BaseVADProvider):
    def __init__(self, threshold: float = 0.02, frame_duration_ms: int = 30, padding_duration_ms: int = 300):
        """
        :param threshold: 振幅能量阈值 (0 到 1 之间)
        :param frame_duration_ms: 逐帧分析的窗口大小（毫秒）
        :param padding_duration_ms: 允许的静音缓冲时长，用于平滑过渡，防止说话中间小停顿导致切片断裂
        """
        self.threshold = threshold
        self.frame_duration = frame_duration_ms
        self.padding_duration = padding_duration_ms

    def segments(self, audio_data: np.ndarray, sample_rate: int = 16000) -> list[dict]:
        # 帧样本数
        frame_size = int(sample_rate * (self.frame_duration / 1000.0))
        if frame_size <= 0 or len(audio_data) < frame_size:
            return []

        # 划分帧并计算每一帧的能量
        num_frames = len(audio_data) // frame_size
        is_speech = []
        for i in range(num_frames):
            frame = audio_data[i * frame_size : (i + 1) * frame_size]
            energy = np.abs(frame).mean()
            is_speech.append(energy > self.threshold)

        # 状态机平滑（Hangover 判定）
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

        # 处理末尾未闭合的段
        if in_segment:
            total_duration = len(audio_data) / sample_rate
            segments.append({"start": round(start_time, 2), "end": round(total_duration, 2)})

        return segments
