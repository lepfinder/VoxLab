import os
import sys
import numpy as np
import soundfile as sf
import librosa

# 确保能 import app 里的 providers
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.providers.vad.webrtc_vad import WebRTCVADProvider
from app.providers.vad.energy_vad import EnergyVADProvider
from app.providers.vad.silero_vad import SileroVADProvider

def debug_vad():
    test_file = "/Users/xiyangxie/workspace/personal/python-ai-server/app/assets/vad_sample.wav"
    if not os.path.exists(test_file):
        print("未找到测试音频，生成一段模拟音频...")
        # 生成一段带有 2s 声音, 2s 静音, 2s 声音的模拟信号
        sr = 16000
        t = np.linspace(0, 2, 2 * sr, endpoint=False)
        sine = 0.5 * np.sin(2 * np.pi * 440 * t)
        silence = np.zeros(2 * sr)
        audio = np.concatenate([sine, silence, sine])
    else:
        print(f"使用测试音频: {test_file}")
        audio, sr = librosa.load(test_file, sr=16000)

    
    print(f"音频长度: {len(audio)/16000:.2f}s, 采样率: {sr}, 幅值 Max: {np.max(audio):.4f}, Mean: {np.mean(np.abs(audio)):.4f}")

    # 1. Silero VAD
    print("\n--- 1. Silero VAD 结果 ---")
    silero = SileroVADProvider()
    print(silero.segments(audio, sr))

    # 2. WebRTC VAD
    print("\n--- 2. WebRTC VAD 结果 (不同 Mode) ---")
    for mode in [1, 2, 3]:
        webrtc = WebRTCVADProvider(mode=mode)
        print(f"Mode {mode}: {webrtc.segments(audio, sr)}")

    # 3. Energy VAD
    print("\n--- 3. Energy VAD 结果 (不同 Threshold) ---")
    # 先分析一下前 10 帧的 RMS 能量分布情况
    frame_size = int(sr * 0.03)
    rms_vals = []
    for i in range(len(audio) // frame_size):
        frame = audio[i * frame_size: (i + 1) * frame_size]
        rms_vals.append(np.sqrt(np.mean(frame ** 2)))
    
    rms_vals = np.array(rms_vals)
    print(f"RMS 能量统计 -> Min: {np.min(rms_vals):.4f}, Max: {np.max(rms_vals):.4f}, Mean: {np.mean(rms_vals):.4f}")
    print(f"RMS 25% 分位数: {np.percentile(rms_vals, 25):.4f}, 50%分位数: {np.percentile(rms_vals, 50):.4f}, 75%分位数: {np.percentile(rms_vals, 75):.4f}")

    for th in [0.01, 0.02, 0.05, 0.1]:
        energy = EnergyVADProvider(threshold=th)
        print(f"Threshold {th}: {energy.segments(audio, sr)}")

if __name__ == "__main__":
    debug_vad()
