import numpy as np
import webrtcvad
from app.providers.vad.base import BaseVADProvider

class WebRTCVADProvider(BaseVADProvider):
    def __init__(self, mode: int = 2, frame_duration_ms: int = 30, padding_duration_ms: int = 150):
        """
        :param mode: 敏感度级别 (0: 最不敏感, 3: 最敏感/最激进地判定为人声)
        :param frame_duration_ms: 帧长，必须是 10, 20 或 30 毫秒
        :param padding_duration_ms: 平滑过渡缓冲时长（毫秒）
        """
        self.vad = webrtcvad.Vad(mode)
        self.mode = mode
        self.frame_duration = frame_duration_ms
        self.padding_duration = padding_duration_ms

    def segments(self, audio_data: np.ndarray, sample_rate: int = 16000) -> list[dict]:
        if sample_rate not in (8000, 16000, 32000, 48000):
            raise ValueError("WebRTC VAD only supports sample rates: 8000, 16000, 32000, 48000 Hz")
        if self.frame_duration not in (10, 20, 30):
            raise ValueError("WebRTC VAD only supports frame durations: 10, 20, 30 ms")

        if len(audio_data) == 0:
            return []

        # 1. 前置差分高通滤波 (消除录音硬件直流偏移和低频轰鸣)
        audio_filtered = np.zeros_like(audio_data)
        audio_filtered[0] = audio_data[0]
        for n in range(1, len(audio_data)):
            audio_filtered[n] = audio_data[n] - 0.96 * audio_data[n - 1]

        # 2. 自适应归一化，使得输入到 webrtcvad 的信号幅度合理
        max_val = np.max(np.abs(audio_filtered))
        if max_val > 0:
            audio_norm = audio_filtered / max_val
        else:
            audio_norm = audio_filtered

        # 3. 提前计算各帧的 RMS 能量，用于“能量预门限”过滤静态环境底噪
        frame_size = int(sample_rate * (self.frame_duration / 1000.0))
        num_frames = len(audio_norm) // frame_size
        rms_vals = []
        for i in range(num_frames):
            frame = audio_norm[i * frame_size : (i + 1) * frame_size]
            rms_vals.append(np.sqrt(np.mean(frame ** 2)) if len(frame) > 0 else 0)
        
        rms_vals = np.array(rms_vals)
        noise_floor = np.percentile(rms_vals, 15) if len(rms_vals) > 0 else 0
        # 调大门限卡死底噪 (Mode 越小越严格)
        energy_bias = {0: 0.12, 1: 0.08, 2: 0.05, 3: 0.02}.get(self.mode, 0.05)
        energy_threshold = noise_floor + energy_bias * (1.0 - noise_floor)

        # 4. 转换 float32 numpy 数组为 16-bit PCM bytes 用于 webrtcvad
        pcm_data = (audio_norm * 32767).astype(np.int16).tobytes()
        frame_bytes_len = frame_size * 2

        if len(pcm_data) < frame_bytes_len:
            return []

        is_speech = []

        for i in range(num_frames):
            # 能量预过滤：如果这帧的 RMS 连自适应环境能量门限都不到，直接判定为静音
            if i < len(rms_vals) and rms_vals[i] < energy_threshold:
                is_speech.append(False)
                continue

            frame_bytes = pcm_data[i * frame_bytes_len : (i + 1) * frame_bytes_len]
            try:
                active = self.vad.is_speech(frame_bytes, sample_rate)
                is_speech.append(active)
            except Exception:
                is_speech.append(False)


        # 状态机平滑（Hangover 与双向滑动均值）

        # webrtcvad 对孤立噪点极度敏感，使用 3 帧滑动窗口做局部平滑过滤突发噪点
        smoothed_raw = []
        for i in range(len(is_speech)):
            start_idx = max(0, i - 1)
            end_idx = min(len(is_speech), i + 2)
            # 局部多数投票
            votes = is_speech[start_idx:end_idx]
            smoothed_raw.append(sum(votes) > len(votes) / 2)

        hangover_frames = int(self.padding_duration / self.frame_duration)
        smoothed_speech = []
        silence_counter = 0
        active = False

        for speech_active in smoothed_raw:
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

        if in_segment:
            total_duration = len(audio_data) / sample_rate
            raw_segments.append({"start": round(start_time, 2), "end": round(total_duration, 2)})

        # ---------------- 工业级 VAD 后处理平滑 ----------------
        if not raw_segments:
            return []

        # 1. 合并相邻的、间隙小于 350ms (0.35s) 的说话段
        merged_segments = []
        current_seg = raw_segments[0]

        for next_seg in raw_segments[1:]:
            silence_gap = next_seg["start"] - current_seg["end"]
            if silence_gap < 0.35:
                # 间隙极短，合并为一个连续片段
                current_seg["end"] = next_seg["end"]
            else:
                merged_segments.append(current_seg)
                current_seg = next_seg
        merged_segments.append(current_seg)

        # 2. 过滤掉孤立的、长度小于 200ms (0.2s) 的噪点片段
        final_segments = []
        for seg in merged_segments:
            duration = seg["end"] - seg["start"]
            if duration >= 0.2:
                final_segments.append(seg)

        return final_segments

