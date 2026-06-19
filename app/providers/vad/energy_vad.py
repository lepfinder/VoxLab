import numpy as np
from app.providers.vad.base import BaseVADProvider

class EnergyVADProvider(BaseVADProvider):
    def __init__(self, threshold: float = 0.02, frame_duration_ms: int = 30, padding_duration_ms: int = 100):
        """
        :param threshold: 能量偏置阈值 (用于控制敏感度)
        :param frame_duration_ms: 逐帧分析的窗口大小（毫秒）
        :param padding_duration_ms: 允许的静音缓冲时长，用于平滑过渡
        """
        self.threshold = threshold
        self.frame_duration = frame_duration_ms
        self.padding_duration = padding_duration_ms

    def segments(self, audio_data: np.ndarray, sample_rate: int = 16000) -> list[dict]:
        if len(audio_data) == 0:
            return []

        # 1. 前置差分高通滤波 (去除直流分量和 80Hz 以下低频环境底噪)
        audio_filtered = np.zeros_like(audio_data)
        audio_filtered[0] = audio_data[0]
        for n in range(1, len(audio_data)):
            audio_filtered[n] = audio_data[n] - 0.96 * audio_data[n - 1]

        # 帧样本数
        frame_size = int(sample_rate * (self.frame_duration / 1000.0))
        num_frames = len(audio_filtered) // frame_size
        rms_vals = []
        for i in range(num_frames):
            frame = audio_filtered[i * frame_size : (i + 1) * frame_size]
            rms_vals.append(np.sqrt(np.mean(frame ** 2)) if len(frame) > 0 else 0)
        
        rms_vals = np.array(rms_vals)
        if len(rms_vals) == 0:
            return []

        # 2. 动态双门限参数估计
        noise_floor = np.percentile(rms_vals, 15)
        max_energy = np.max(rms_vals)
        energy_range = max_energy - noise_floor + 1e-5

        # 调大门限卡死底噪：高门限开启，低门限维持
        th_on = noise_floor + (self.threshold * 4.0) * energy_range
        th_off = noise_floor + (self.threshold * 1.5) * energy_range

        # 3. 双门限状态机决策
        is_speech = []
        speaking = False
        for rms in rms_vals:
            if speaking:
                if rms < th_off:
                    speaking = False
            else:
                if rms > th_on:
                    speaking = True
            is_speech.append(speaking)

        # 4. 状态机 Hangover 平滑
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
        raw_segments = []
        in_segment = False
        start_time = 0.0

        for idx, active in enumerate(smoothed_speech):
            current_time = (idx * frame_size) / sample_rate
            if active and not in_segment:
                in_segment = True
                start_time = current_time
            elif not active and in_segment:
                in_segment = False
                raw_segments.append({"start": round(start_time, 2), "end": round(current_time, 2)})

        # 处理末尾未闭合的段
        if in_segment:
            total_duration = len(audio_data) / sample_rate
            raw_segments.append({"start": round(start_time, 2), "end": round(total_duration, 2)})

        # ---------------- 后处理合并与平滑 ----------------
        if not raw_segments:
            return []

        # 1. 合并小于 350ms 的静音缝隙
        merged_segments = []
        current_seg = raw_segments[0]

        for next_seg in raw_segments[1:]:
            silence_gap = next_seg["start"] - current_seg["end"]
            if silence_gap < 0.35:
                current_seg["end"] = next_seg["end"]
            else:
                merged_segments.append(current_seg)
                current_seg = next_seg
        merged_segments.append(current_seg)

        # 2. 过滤小于 200ms 的噪点段
        final_segments = []
        for seg in merged_segments:
            duration = seg["end"] - seg["start"]
            if duration >= 0.2:
                final_segments.append(seg)

        return final_segments


