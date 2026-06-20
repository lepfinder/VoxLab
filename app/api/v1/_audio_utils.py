"""
音频处理工具类模块
包含 ThinkFilter（LLM思考过程过滤器）和 VoiceStreamHandler（实时语音流处理器）
"""
import logging
import numpy as np
import opuslib

logger = logging.getLogger(__name__)


class ThinkFilter:
    """过滤 LLM 输出中的 <think>...</think> 思考过程，包含首段缓冲判定逻辑，防止 <think> 标签被剥离时泄漏思考过程"""

    def __init__(self):
        self.in_think = False
        self.started = False
        self.initial_buffer = ""
        self.buffer = ""
        self.MAX_HEURISTIC_LEN = 300  # 最大判定缓冲长度

    def feed(self, text: str) -> str:
        # 如果尚未判定完毕，先放入初始判定缓冲区
        if not self.started:
            self.initial_buffer += text
            
            # 1. 快速判定：如果首包看到了标准标签，立即进入思考状态
            if "<think>" in self.initial_buffer:
                self.in_think = True
                self.started = True
                self.buffer = self.initial_buffer
                self.initial_buffer = ""
            # 2. 快速判定：如果已经看到了思考结束标签，立即剥离思考部分并释放
            elif "</think>" in self.initial_buffer:
                idx = self.initial_buffer.find("</think>")
                remaining = self.initial_buffer[idx + 8:]
                self.in_think = False
                self.started = True
                self.initial_buffer = ""
                self.buffer = remaining
            # 3. 智能零延迟判定：如果缓冲区内已经有标点符号，说明这不可能是长篇思考（思考通常不会直接在一句话内就结束）
            # 或者是短句普通应答，直接判定为非思考，立即释放避免 TTS 延迟
            elif any(p in self.initial_buffer for p in ["。", "？", "！", "；", ".", "?", "!", "\n"]):
                self.started = True
                self.buffer = self.initial_buffer
                self.initial_buffer = ""
            # 4. 兜底长度：如果既没标点也没标签，且累积字数超过 40 字，大概率是在输出一长串没有标点的思考，继续缓冲直到 MAX_HEURISTIC_LEN
            elif len(self.initial_buffer) >= self.MAX_HEURISTIC_LEN:
                self.started = True
                self.buffer = self.initial_buffer
                self.initial_buffer = ""
            # 5. 为了极速响应，如果首个 chunk 吐出来的字数很少（例如小于 15 个字）且包含常见回答词（如 "对"、"是"、"好" 等），也可以直接判定释放
            elif len(self.initial_buffer) > 0 and any(w in self.initial_buffer for w in ["好", "是", "对", "哈", "嗯", "没"]):
                self.started = True
                self.buffer = self.initial_buffer
                self.initial_buffer = ""
            else:
                # 依然不确定时，才继续等待
                return ""

        # 判定完成后，进入正常的流式过滤逻辑
        self.buffer += text
        output = ""
        while self.buffer:
            if not self.in_think:
                idx = self.buffer.find("<think>")
                if idx != -1:
                    output += self.buffer[:idx]
                    self.buffer = self.buffer[idx + 7:]
                    self.in_think = True
                else:
                    # 容错：如果意外在非思考状态见到了 </think>，将其前面的内容丢弃
                    err_idx = self.buffer.find("</think>")
                    if err_idx != -1:
                        self.buffer = self.buffer[err_idx + 8:]
                        continue

                    partial_match = False
                    for i in range(1, min(7, len(self.buffer) + 1)):
                        suffix = self.buffer[-i:]
                        if "<think>".startswith(suffix):
                            output += self.buffer[:-i]
                            self.buffer = suffix
                            partial_match = True
                            break
                    if not partial_match:
                        output += self.buffer
                        self.buffer = ""
                    else:
                        break
            else:
                idx = self.buffer.find("</think>")
                if idx != -1:
                    self.buffer = self.buffer[idx + 8:]
                    self.in_think = False
                else:
                    if len(self.buffer) > 8:
                        self.buffer = self.buffer[-8:]
                    break
        return output

    def flush(self) -> str:
        res = ""
        if not self.started:
            # 如果到结束还没判定完（总字数极少），直接看里面有没有 </think>
            if "</think>" in self.initial_buffer:
                idx = self.initial_buffer.find("</think>")
                res = self.initial_buffer[idx + 8:]
            elif "<think>" in self.initial_buffer:
                idx = self.initial_buffer.find("<think>")
                res = self.initial_buffer[:idx]
            else:
                res = self.initial_buffer
            self.initial_buffer = ""
            self.started = True
            return res

        if not self.in_think:
            res = self.buffer
            self.buffer = ""
            return res
        return ""



class VoiceStreamHandler:
    """实时语音流处理器：解码 Opus 音频包，通过简单能量 VAD 检测语音结束并触发 ASR"""

    def __init__(self, provider):
        self.decoder = opuslib.Decoder(16000, 1)
        self.provider = provider
        self.pcm_buffer = []
        self.is_speaking = False
        self.silence_count = 0
        self.VAD_THRESHOLD = 800        # 能量阈值，保持灵敏度
        self.SILENCE_END_FRAMES = 14    # 静音帧数（约 0.84s），允许更自然的停顿

    async def process_packet(self, data: bytes):
        try:
            pcm = self.decoder.decode(data, 960)
            pcm_np = np.frombuffer(pcm, dtype=np.int16)
            energy = np.abs(pcm_np).mean()

            if energy > self.VAD_THRESHOLD:
                if not self.is_speaking:
                    self.is_speaking = True
                    logger.info(">>> [Python VAD] Voice Start")
                self.silence_count = 0
                self.pcm_buffer.append(pcm_np)
            elif self.is_speaking:
                self.silence_count += 1
                self.pcm_buffer.append(pcm_np)

                if self.silence_count > self.SILENCE_END_FRAMES:
                    logger.info("<<< [Python VAD] Voice End (Triggering ASR)")
                    audio_data = np.concatenate(self.pcm_buffer).astype(np.float32) / 32768.0
                    self.pcm_buffer = []
                    self.is_speaking = False
                    self.silence_count = 0

                    # SenseVoice 识别非常快，直接在这里调用
                    result = self.provider.transcribe(audio_data)
                    text = result.get("text", "").strip()

                    # 过滤逻辑：太短或纯标点忽略
                    if len(text) <= 1 or text in ["。", "？", "！", ".", "?", "!"]:
                        logger.info(f"--- [Python VAD] Ignored noise/short text: {text}")
                        return None

                    return text
            return None
        except Exception as e:
            logger.error(f"VoiceStream Error: {e}")
            return None
