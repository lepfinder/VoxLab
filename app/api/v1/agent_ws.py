"""
WebSocket Agent 实时语音对话接口
- WS  /api/v1/audio/voice       简单语音流 (Opus → ASR → 返回文本)
- WS  /api/v1/audio/agent/ws    完整智能对话 (ASR → LLM → TTS → 音频流)
"""
import os
import uuid
import base64
import re
import json
import asyncio
import tempfile
import logging
import numpy as np
import soundfile as sf
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.providers.asr.sensevoice_provider import SenseVoiceProvider
from app.providers.asr.vosk_provider import VoskProvider
from app.providers.asr.qwen_asr_provider import QwenASRProvider
from app.providers.tts.edge_tts_provider import EdgeTTSProvider
from app.providers.tts.kokoro_provider import KokoroProvider
from app.providers.tts.qwen_tts_provider import QwenTTSProvider
from app.providers.tts.omni_provider import OmniVoiceProvider
from app.providers.tts.voxcpm_provider import VoxCPMProvider
from app.providers.vad.silero_vad import SileroVADProvider
from app.api.v1._audio_utils import ThinkFilter, VoiceStreamHandler

router = APIRouter(prefix="/api/v1/audio")
logger = logging.getLogger(__name__)

# 实例化提供者（模块级单例）
sensevoice_provider = SenseVoiceProvider()
vosk_provider = VoskProvider()
qwen_asr_provider = QwenASRProvider()

edge_tts_provider = EdgeTTSProvider()
omni_provider = OmniVoiceProvider()
voxcpm_provider = VoxCPMProvider()

silero_vad_provider = SileroVADProvider()


def clean_tts_text(text: str) -> str:
    """过滤文本中由括号或星号包围的情感/动作修饰语，以及无意义的波浪号"""
    # 移除英文/中文括号内的情感或动作说明
    cleaned = re.sub(r'\(.*?\)|（.*?）', '', text)
    # 移除星号包围的说明 (例如 *歪头*)
    cleaned = re.sub(r'\*.*?\*', '', cleaned)
    # 移除多余的波浪号
    cleaned = cleaned.replace('~', '')
    return cleaned.strip()


def is_valid_tts_text(text: str) -> bool:
    """判断文本是否是能够发音的有效文本，若只包含标点符号或空白，则返回 False"""
    if not text:
        return False
    # 检查是否仅由标点符号、特殊字符和空白组成
    punctuation_pattern = r'^[\s\u3002\uff1f\uff01\uff0c\u3001\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09\(\)\*\[\]\{\}\-\_\+\=\|\&\%\#\@\^\~\`\.\,\?\!\;\:\'\"]+$'
    if re.match(punctuation_pattern, text):
        return False
    return True


@router.websocket("/voice")
async def voice_websocket(websocket: WebSocket):
    """简单语音流：接收 Opus 音频包，返回 ASR 识别结果文本"""
    await websocket.accept()
    handler = VoiceStreamHandler(sensevoice_provider)
    logger.info("[WS] Voice stream connection accepted")
    try:
        while True:
            data = await websocket.receive_bytes()
            text = await handler.process_packet(data)
            if text:
                await websocket.send_json({"type": "asr_result", "text": text})
    except WebSocketDisconnect:
        logger.info("[WS] Voice stream disconnected")
    except Exception as e:
        logger.error(f"[WS] Error: {e}")


@router.websocket("/agent/ws")
async def agent_websocket(websocket: WebSocket):
    """完整智能对话：VAD → ASR → LLM（过滤思考过程）→ TTS → 音频流"""
    await websocket.accept()
    logger.info("[WS Agent] Client connected")

    speaker_id = "haruna"
    conversation_id = None

    # 读取 query 参数
    params = websocket.query_params
    if "speaker_id" in params:
        speaker_id = params["speaker_id"]
    if "conversation_id" in params:
        conversation_id = params["conversation_id"]

    # 延迟导入，避免循环依赖
    from app.core.database import db
    from app.providers.llm.openai_compat import OpenAICompatClient

    # 加载 Speaker & Voice 信息
    speaker = db.get_speaker(speaker_id) or db.get_speaker("haruna")
    voice_info = db.get_voice(speaker["voice_id"]) if speaker and speaker.get("voice_id") else None
    system_prompt = speaker["system_prompt"] if speaker else "You are a helpful AI assistant."

    # 初始化消息列表
    messages = [{"role": "system", "content": system_prompt}]
    if conversation_id:
        db_msgs = db.list_messages(conversation_id)
        for m in db_msgs:
            messages.append({"role": m["role"], "content": m["content"]})

    # 确保 Silero VAD 已加载
    silero_vad_provider.load()

    # VAD 状态
    audio_buffer = []
    speaking = False
    samples_since_last_vad = 0
    silence_timeout = 0.8  # 静音超时阈值（秒）

    # 响应任务管理
    response_task = None

    async def send_status(status_str: str):
        try:
            await websocket.send_json({"type": "status", "status": status_str})
        except:
            pass

    async def interrupt_response():
        nonlocal response_task
        if response_task and not response_task.done():
            response_task.cancel()
            logger.info("[WS Agent] Cancelled active response task due to user interruption")
            try:
                await websocket.send_json({"type": "interrupt"})
            except:
                pass
            await send_status("listening")

    async def run_tts_and_stream(text_to_synthesize: str):
        """将一句话通过对应 TTS 引擎合成并分块推送给客户端"""
        nonlocal voice_info

        cleaned_text = clean_tts_text(text_to_synthesize)
        if not is_valid_tts_text(cleaned_text):
            logger.info(f"[WS Agent] Skip synthesis for invalid/empty sentence: {text_to_synthesize!r} (cleaned: {cleaned_text!r})")
            return

        tts_provider_name = voice_info["tts_provider"].lower() if voice_info else "edge"
        tts_voice = voice_info["tts_voice"] if voice_info else "zh-CN-XiaoxiaoNeural"

        logger.info(f"[WS Agent] Synthesis sentence: {cleaned_text} (original: {text_to_synthesize})")
        try:
            if "edge" in tts_provider_name:
                async for chunk in edge_tts_provider.stream_generate(cleaned_text, tts_voice):
                    if chunk:
                        await websocket.send_json({
                            "type": "audio_chunk",
                            "audio": base64.b64encode(chunk).decode("utf-8")
                        })
            elif "qwen" in tts_provider_name:
                p = QwenTTSProvider(mode="custom" if tts_voice != "None" else "design")
                for chunk in p.stream_generate(cleaned_text, voice=tts_voice):
                    if chunk:
                        await websocket.send_json({
                            "type": "audio_chunk",
                            "audio": base64.b64encode(chunk).decode("utf-8")
                        })
            else:
                # 非流式模型（kokoro / omni / voxcpm）
                path = None
                if "kokoro" in tts_provider_name:
                    p = KokoroProvider()
                    audio_np = p.generate(cleaned_text, voice=tts_voice)
                    if audio_np is not None:
                        import librosa
                        audio_16k = librosa.resample(audio_np, orig_sr=24000, target_sr=16000)
                        full_pcm_data = (np.clip(audio_16k, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
                        for i in range(0, len(full_pcm_data), 4096):
                            await websocket.send_json({
                                "type": "audio_chunk",
                                "audio": base64.b64encode(full_pcm_data[i:i + 4096]).decode("utf-8")
                            })
                elif "omni" in tts_provider_name:
                    path = omni_provider.generate(cleaned_text)
                elif "vox" in tts_provider_name:
                    path = voxcpm_provider.generate(cleaned_text)

                if path and os.path.exists(path):
                    data, sr = sf.read(path, dtype='int16')
                    if sr != 16000:
                        import librosa
                        data = librosa.resample(data.astype(np.float32), orig_sr=sr, target_sr=16000)
                        data = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16)
                    pcm_data = data.tobytes()
                    os.remove(path)
                    for i in range(0, len(pcm_data), 4096):
                        await websocket.send_json({
                            "type": "audio_chunk",
                            "audio": base64.b64encode(pcm_data[i:i + 4096]).decode("utf-8")
                        })
        except Exception as e:
            logger.error(f"[WS Agent] TTS Error: {e}")

    async def process_response(user_text: str):
        """LLM 流式生成并逐句 TTS 合成：过滤 <think> 思考段，不发送给 TTS 也不显示给用户"""
        nonlocal messages
        try:
            # 1. 更新数据库 & 消息列表
            if conversation_id:
                db.add_message(str(uuid.uuid4()), conversation_id, "user", user_text)
            messages.append({"role": "user", "content": user_text})

            # 2. 获取 LLM 配置
            config = None
            if speaker and speaker.get("llm_config_id"):
                config = db.get_llm_config(speaker["llm_config_id"])
            if not config:
                config = db.get_default_llm_config()

            if not config:
                logger.error("[WS Agent] LLM config not found")
                await websocket.send_json({"type": "error", "message": "LLM config not found"})
                return

            llm_model = (speaker.get("llm_model") if speaker else None) or config["model"]

            # 打印详细的 LLM 调用调试日志，方便核对系统提示词（System Prompt）是否注入成功
            logger.info("=" * 60)
            logger.info("[WS Agent] Preparing LLM stream request:")
            logger.info(f" - Upstream URL: {config['base_url']}")
            logger.info(f" - Model Name  : {llm_model}")
            logger.info(f" - Speaker ID  : {speaker_id}")
            logger.info(f" - System Prompt: {system_prompt}")
            logger.info(f" - Context Size : {len(messages)} messages (including system prompt)")
            logger.info(f" - Latest User Input: '{user_text}'")
            logger.info("=" * 60)

            client = OpenAICompatClient(
                base_url=config["base_url"],
                api_key=config["api_key"],
                model=llm_model,
            )

            await websocket.send_json({"type": "llm_start"})
            await send_status("thinking")

            # 3. 流式 LLM + 逐句 TTS
            sentence_buffer = ""
            full_assistant_response = []
            full_thought_response = []
            prompt_tokens, completion_tokens = 0, 0

            # ThinkFilter 过滤思考过程，过滤后的内容才发送给前端和 TTS
            think_filter = ThinkFilter()
            async for chunk in client.stream_chat(messages, temperature=0.7):
                # 读取上游 LLM 返回的 Token 统计
                usage = chunk.get("usage")
                if usage:
                    prompt_tokens = usage.get("prompt_tokens", prompt_tokens)
                    completion_tokens = usage.get("completion_tokens", completion_tokens)

                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta", {}) or {}

                # 优先过滤大模型原生的思维链/思考字段并记录
                reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                if reasoning:
                    full_thought_response.append(reasoning)
                    continue
                
                content = delta.get("content")
                if content:
                    # 容错：有些模型将思考内容包裹在 <think> 内返回到 content 中
                    if think_filter.in_think or "<think>" in content or "</think>" in content:
                        # 喂给 think_filter，同时提取被滤出的思考过程
                        filtered_content = think_filter.feed(content)
                        # 被过滤掉的实际上是思考文字，这里通过差分把被扣留的思考内容拿出来
                        # 粗略逻辑：本期输入减去本期输出，即为本期被拦截的思考字
                        # 只有在判定完成后，且处于 think 状态时，或者开始前 initial_buffer 时段累积
                        pass
                    else:
                        filtered_content = think_filter.feed(content)

                    # 记录 ThinkFilter 的状态并补充记录 thought
                    # 为了更简单地捕获被 ThinkFilter 扣留的思考内容：
                    # 在 started 之前，如果没有任何输出且 in_think 开启，则全部视作 thought 累积
                    if not think_filter.started:
                        # 在首包判定中，如果还没有释放，内容均在 initial_buffer 中，如果是思考，直接累加
                        pass
                    
                    if filtered_content:
                        await websocket.send_json({"type": "llm_chunk", "text": filtered_content})
                        full_assistant_response.append(filtered_content)
                        sentence_buffer += filtered_content

                        # 按标点切句触发 TTS
                        m = re.search(r'[。？！；\n]|[.?!\n]', sentence_buffer)
                        if m:
                            split_idx = m.end()
                            sentence = sentence_buffer[:split_idx].strip()
                            sentence_buffer = sentence_buffer[split_idx:]
                            if sentence:
                                await send_status("speaking")
                                await run_tts_and_stream(sentence)

            # 冲洗 ThinkFilter 剩余缓冲
            last_filtered = think_filter.flush()
            if last_filtered:
                await websocket.send_json({"type": "llm_chunk", "text": last_filtered})
                full_assistant_response.append(last_filtered)
                sentence_buffer += last_filtered

            # 合成剩余句子
            remainder = sentence_buffer.strip()
            if remainder:
                await send_status("speaking")
                await run_tts_and_stream(remainder)

            # 4. 完成响应并归档到数据库
            assistant_text = "".join(full_assistant_response)
            thought_text = "".join(full_thought_response).strip() or None
            total_tokens = prompt_tokens + completion_tokens

            if conversation_id:
                db.add_message(
                    message_id=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    role="assistant",
                    content=assistant_text,
                    tokens=total_tokens,
                    thought=thought_text,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens
                )
            messages.append({"role": "assistant", "content": assistant_text})

            await websocket.send_json({"type": "llm_end"})
            await websocket.send_json({"type": "audio_end"})
            await send_status("listening")

        except asyncio.CancelledError:
            logger.info("[WS Agent] response generation cancelled")
            raise
        except Exception as e:
            logger.error(f"[WS Agent] process_response error: {e}")
            await websocket.send_json({"type": "error", "message": str(e)})
            await send_status("listening")

    # 主循环
    try:
        await send_status("listening")
        while True:
            message = await websocket.receive()

            if "bytes" in message:
                data = message["bytes"]
                if not data:
                    continue

                chunk_np = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                audio_buffer.append(chunk_np)
                samples_since_last_vad += len(chunk_np)

                # 每 250ms（4000 采样）运行一次 VAD
                if samples_since_last_vad >= 4000:
                    samples_since_last_vad = 0
                    current_audio = np.concatenate(audio_buffer)
                    duration = len(current_audio) / 16000.0

                    segments = silero_vad_provider.segments(current_audio, sample_rate=16000)

                    if not speaking:
                        if len(segments) > 0:
                            speaking = True
                            await interrupt_response()
                            await send_status("listening")
                    else:
                        if len(segments) > 0:
                            last_end = segments[-1]["end"]
                            silence_dur = duration - last_end
                            if silence_dur >= silence_timeout:
                                logger.info(f"[WS Agent] Voice End detected (silence: {silence_dur:.2f}s)")
                                await send_status("recognizing")

                                end_idx = int((last_end + 0.2) * 16000)
                                speech_audio = current_audio[:end_idx]

                                audio_buffer = []
                                speaking = False

                                # ASR 识别
                                asr_provider_name = "sensevoice"
                                text = ""
                                try:
                                    if "sensevoice" in asr_provider_name:
                                        result = sensevoice_provider.transcribe(speech_audio)
                                        text = result.get("text", "").strip()
                                    elif "vosk" in asr_provider_name:
                                        pcm_bytes = (np.clip(speech_audio, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
                                        text = vosk_provider.transcribe(pcm_bytes)
                                    elif "qwen" in asr_provider_name:
                                        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                                            sf.write(tmp.name, speech_audio, 16000)
                                            tmp_path = tmp.name
                                        try:
                                            text = qwen_asr_provider.transcribe(tmp_path)
                                        finally:
                                            if os.path.exists(tmp_path):
                                                os.remove(tmp_path)
                                except Exception as e:
                                    logger.error(f"[WS Agent] ASR error: {e}")

                                logger.info(f"[WS Agent] ASR text: {text}")
                                if len(text) <= 1 or text in ["。", "？", "！", ".", "?", "!"]:
                                    logger.info(f"[WS Agent] Ignored noise/short text: {text}")
                                    await send_status("listening")
                                else:
                                    await websocket.send_json({"type": "asr_result", "text": text})
                                    response_task = asyncio.create_task(process_response(text))
                        else:
                            if duration > 3.0:
                                logger.info("[WS Agent] Resetting speaking state due to lack of VAD segments")
                                speaking = False
                                audio_buffer = []

            elif "text" in message:
                try:
                    cmd = json.loads(message["text"])
                    if cmd.get("type") == "start":
                        speaker_id = cmd.get("speaker_id", speaker_id)
                        conversation_id = cmd.get("conversation_id", conversation_id)
                        speaker = db.get_speaker(speaker_id) or speaker
                        voice_info = db.get_voice(speaker["voice_id"]) if speaker and speaker.get("voice_id") else voice_info
                        system_prompt = speaker["system_prompt"] if speaker else system_prompt
                        messages = [{"role": "system", "content": system_prompt}]
                        if conversation_id:
                            db_msgs = db.list_messages(conversation_id)
                            for m in db_msgs:
                                messages.append({"role": m["role"], "content": m["content"]})
                        logger.info(f"[WS Agent] Started session: speaker={speaker_id}, conversation={conversation_id}")
                    elif cmd.get("type") == "interrupt":
                        await interrupt_response()
                except Exception as e:
                    logger.error(f"[WS Agent] Failed to parse control text: {e}")

    except WebSocketDisconnect:
        logger.info("[WS Agent] Disconnected")
    except Exception as e:
        logger.error(f"[WS Agent] Websocket Loop Error: {e}")
    finally:
        if response_task and not response_task.done():
            response_task.cancel()
