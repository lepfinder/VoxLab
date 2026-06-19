import io
import uuid
import os
import tempfile
import struct
import numpy as np
import soundfile as sf
import logging
import opuslib
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask
from app.schemas.openai import TranscriptionResponse, SpeechRequest
from app.providers.asr.sensevoice_provider import SenseVoiceProvider
from app.providers.asr.vosk_provider import VoskProvider
from app.providers.asr.qwen_asr_provider import QwenASRProvider
from app.providers.tts.edge_tts_provider import EdgeTTSProvider
from app.providers.tts.kokoro_provider import KokoroProvider
from app.providers.tts.qwen_tts_provider import QwenTTSProvider
from app.providers.tts.omni_provider import OmniVoiceProvider
from app.providers.tts.voxcpm_provider import VoxCPMProvider
from app.providers.vad import EnergyVADProvider, WebRTCVADProvider, SileroVADProvider
# --- 实时语音流处理逻辑 ---
class VoiceStreamHandler:
    def __init__(self, provider):
        self.decoder = opuslib.Decoder(16000, 1)
        self.provider = provider
        self.pcm_buffer = []
        self.is_speaking = False
        self.silence_count = 0
        self.VAD_THRESHOLD = 800 # 调回 800，保持灵敏度
        self.SILENCE_END_FRAMES = 14 # 增加静音帧数（约 0.84s），允许更自然的停顿

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
                    
                    # 过滤逻辑：如果识别结果太短（只有1个字）或者是纯标点符号，直接忽略
                    if len(text) <= 1 or text in ["。", "？", "！", ".", "?", "!"]:
                        logger.info(f"--- [Python VAD] Ignored noise/short text: {text}")
                        return None
                        
                    return text
            return None
        except Exception as e:
            logger.error(f"VoiceStream Error: {e}")
            return None

router = APIRouter(prefix="/api/v1/audio")
logger = logging.getLogger(__name__)

# 实例化提供者
sensevoice_provider = SenseVoiceProvider()
vosk_provider = VoskProvider()
qwen_asr_provider = QwenASRProvider()

edge_tts_provider = EdgeTTSProvider()
omni_provider = OmniVoiceProvider()
voxcpm_provider = VoxCPMProvider()

energy_vad_provider = EnergyVADProvider()
webrtc_vad_provider = WebRTCVADProvider()
silero_vad_provider = SileroVADProvider()

@router.websocket("/voice")
async def voice_websocket(websocket: WebSocket):
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
    import base64
    import re
    import asyncio
    from app.core.database import db
    from app.providers.llm.openai_compat import OpenAICompatClient
    
    await websocket.accept()
    logger.info("[WS Agent] Client connected")

    speaker_id = "haruna"
    conversation_id = None
    
    # Query parameters
    params = websocket.query_params
    if "speaker_id" in params:
        speaker_id = params["speaker_id"]
    if "conversation_id" in params:
        conversation_id = params["conversation_id"]

    # Load speaker & voice info
    speaker = db.get_speaker(speaker_id) or db.get_speaker("haruna")
    voice_info = db.get_voice(speaker["voice_id"]) if speaker and speaker.get("voice_id") else None
    system_prompt = speaker["system_prompt"] if speaker else "You are a helpful AI assistant."
    
    # Initialize message list
    messages = [{"role": "system", "content": system_prompt}]
    if conversation_id:
        db_msgs = db.list_messages(conversation_id)
        for m in db_msgs:
            messages.append({"role": m["role"], "content": m["content"]})

    # Ensure Silero VAD is loaded
    silero_vad_provider.load()

    # VAD states
    audio_buffer = []
    speaking = False
    samples_since_last_vad = 0
    silence_timeout = 0.8  # seconds

    # Response task manager
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

    # Helper to generate LLM stream and cascade TTS
    async def process_response(user_text: str):
        nonlocal messages
        try:
            # 1. Update DB & messages
            if conversation_id:
                db.add_message(str(uuid.uuid4()), conversation_id, "user", user_text)
            messages.append({"role": "user", "content": user_text})

            # 2. Get LLM config
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

            client = OpenAICompatClient(
                base_url=config["base_url"],
                api_key=config["api_key"],
                model=llm_model,
            )

            # Send LLM start
            await websocket.send_json({"type": "llm_start"})
            await send_status("thinking")

            # 3. Stream LLM and buffer sentences
            sentence_buffer = ""
            full_assistant_response = []
            
            # Helper to run TTS for a sentence and stream chunks
            async def run_tts_and_stream(text_to_synthesize: str):
                nonlocal voice_info
                tts_provider_name = voice_info["tts_provider"].lower() if voice_info else "edge"
                tts_voice = voice_info["tts_voice"] if voice_info else "zh-CN-XiaoxiaoNeural"
                
                logger.info(f"[WS Agent] Synthesis sentence: {text_to_synthesize}")
                try:
                    if "edge" in tts_provider_name:
                        async for chunk in edge_tts_provider.stream_generate(text_to_synthesize, tts_voice):
                            if chunk:
                                await websocket.send_json({
                                    "type": "audio_chunk",
                                    "audio": base64.b64encode(chunk).decode("utf-8")
                                })
                    elif "qwen" in tts_provider_name:
                        p = QwenTTSProvider(mode="custom" if tts_voice != "None" else "design")
                        for chunk in p.stream_generate(text_to_synthesize, voice=tts_voice):
                            if chunk:
                                await websocket.send_json({
                                    "type": "audio_chunk",
                                    "audio": base64.b64encode(chunk).decode("utf-8")
                                })
                    else:
                        # Fallback for non-stream models (kokoro, omni, voxcpm)
                        path = None
                        if "kokoro" in tts_provider_name:
                            p = KokoroProvider()
                            audio_np = p.generate(text_to_synthesize, voice=tts_voice)
                            if audio_np is not None:
                                import librosa
                                audio_16k = librosa.resample(audio_np, orig_sr=24000, target_sr=16000)
                                full_pcm_data = (np.clip(audio_16k, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
                                for i in range(0, len(full_pcm_data), 4096):
                                    await websocket.send_json({
                                        "type": "audio_chunk",
                                        "audio": base64.b64encode(full_pcm_data[i:i+4096]).decode("utf-8")
                                    })
                        elif "omni" in tts_provider_name:
                            path = omni_provider.generate(text_to_synthesize)
                        elif "vox" in tts_provider_name:
                            path = voxcpm_provider.generate(text_to_synthesize)
                        
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
                                    "audio": base64.b64encode(pcm_data[i:i+4096]).decode("utf-8")
                                })
                except Exception as e:
                    logger.error(f"[WS Agent] TTS Error: {e}")

            # Stream LLM
            async for chunk in client.stream_chat(messages, temperature=0.7):
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta", {}) or {}
                content = delta.get("content")
                if content:
                    await websocket.send_json({"type": "llm_chunk", "text": content})
                    full_assistant_response.append(content)
                    sentence_buffer += content
                    
                    # Split sentences by punctuation
                    m = re.search(r'[。？！；\n]|[.?!\n]', sentence_buffer)
                    if m:
                        split_idx = m.end()
                        sentence = sentence_buffer[:split_idx].strip()
                        sentence_buffer = sentence_buffer[split_idx:]
                        if sentence:
                            await send_status("speaking")
                            await run_tts_and_stream(sentence)

            # Synthesize remainder if any
            remainder = sentence_buffer.strip()
            if remainder:
                await send_status("speaking")
                await run_tts_and_stream(remainder)

            # Finish Response
            assistant_text = "".join(full_assistant_response)
            if conversation_id:
                db.add_message(str(uuid.uuid4()), conversation_id, "assistant", assistant_text)
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

    # Main WebSocket receive loop
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
                
                # Run VAD every 250ms (4000 samples)
                if samples_since_last_vad >= 4000:
                    samples_since_last_vad = 0
                    current_audio = np.concatenate(audio_buffer)
                    duration = len(current_audio) / 16000.0
                    
                    # Run Silero VAD
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
                                
                                # Run ASR (ASR now defaults to sensevoice system-wide)
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
                    import json
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

@router.post("/speech")
async def speech(request_body: SpeechRequest, request: Request):
    from app.core.database import db
    voice_info = db.get_voice(request_body.voice)
    if voice_info:
        request_body.model = voice_info["tts_provider"]
        request_body.voice = voice_info["tts_voice"]

    request.state.model_name = request_body.model
    model_key = request_body.model.lower()
    output_path = None
    audio_bytes = None
    temp_ref_path = None

    if request_body.ref_audio:
        import base64
        import tempfile
        ref_data = request_body.ref_audio
        if "," in ref_data:
            ref_data = ref_data.split(",", 1)[1]
        try:
            decoded_bytes = base64.b64decode(ref_data)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp.write(decoded_bytes)
                temp_ref_path = tmp.name
            logger.info(f"[TTS] Decoded base64 ref_audio, saved to temporary path: {temp_ref_path}")
        except Exception as e:
            logger.error(f"[TTS] Failed to decode base64 ref_audio: {e}")

    logger.info(f"[TTS] Model: {request_body.model}, Format: {request_body.response_format}, Text: {request_body.input[:50]}...")

    try:
        # 特殊处理 Opus 流式格式 (对接硬件)
        if request_body.response_format == "opus":
            async def opus_stream():
                encoder = opuslib.Encoder(16000, 1, opuslib.APPLICATION_VOIP)
                frame_size = 960 # 60ms
                pcm_accum = np.array([], dtype=np.int16)
                total_samples_received = 0
                total_packets_sent = 0
                
                logger.info(f"[TTS] Starting streaming Opus encoding for: {request_body.input[:30]}...")

                # 为了调试，收集所有 PCM 数据并保存为 WAV
                debug_pcm_list = []

                async def process_pcm_chunk(chunk_bytes):
                    nonlocal pcm_accum, total_samples_received, total_packets_sent, debug_pcm_list
                    if not chunk_bytes: return
                    
                    chunk_np = np.frombuffer(chunk_bytes, dtype=np.int16)
                    debug_pcm_list.append(chunk_np)
                    total_samples_received += len(chunk_np)
                    pcm_accum = np.concatenate([pcm_accum, chunk_np])
                    
                    while len(pcm_accum) >= frame_size:
                        frame = pcm_accum[:frame_size]
                        pcm_accum = pcm_accum[frame_size:]
                        try:
                            opus_data = encoder.encode(frame.tobytes(), frame_size)
                            total_packets_sent += 1
                            yield struct.pack(">H", len(opus_data)) + opus_data
                        except Exception as e:
                            logger.error(f"Opus Encode Error: {e}")

                # 数据获取与实时编码
                if "qwen" in model_key:
                    mode = "design"
                    if temp_ref_path:
                        mode = "clone"
                    elif request_body.voice and request_body.voice != "None":
                        mode = "custom"
                    provider = QwenTTSProvider(mode=mode)
                    for chunk in provider.stream_generate(
                        request_body.input, 
                        voice=request_body.voice, 
                        instruct=request_body.instruct,
                        ref_audio=temp_ref_path,
                        ref_text=request_body.ref_text
                    ):
                        async for opus_packet in process_pcm_chunk(chunk):
                            yield opus_packet
                elif "edge" in model_key:
                    async for chunk in edge_tts_provider.stream_generate(request_body.input, request_body.voice):
                        async for opus_packet in process_pcm_chunk(chunk):
                            yield opus_packet
                else:
                    # 其他非流式模型逻辑...
                    full_pcm_data = b""
                    if "kokoro" in model_key:
                        p = KokoroProvider()
                        audio_np = p.generate(request_body.input, voice=request_body.voice)
                        if audio_np is not None:
                            import librosa
                            audio_16k = librosa.resample(audio_np, orig_sr=24000, target_sr=16000)
                            full_pcm_data = (np.clip(audio_16k, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
                    else:
                        path = None
                        if "omni" in model_key: path = omni_provider.generate(request_body.input)
                        elif "vox" in model_key: path = voxcpm_provider.generate(request_body.input)
                        if path and os.path.exists(path):
                            data, sr = sf.read(path, dtype='int16')
                            if sr != 16000:
                                import librosa
                                data = librosa.resample(data.astype(np.float32), orig_sr=sr, target_sr=16000)
                                data = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16)
                            full_pcm_data = data.tobytes()
                            os.remove(path)
                    
                    if full_pcm_data:
                        async for opus_packet in process_pcm_chunk(full_pcm_data):
                            yield opus_packet

                # 处理剩余尾部
                if len(pcm_accum) > 0:
                    pad_size = frame_size - len(pcm_accum)
                    final_frame = np.concatenate([pcm_accum, np.zeros(pad_size, dtype=np.int16)])
                    try:
                        opus_data = encoder.encode(final_frame.tobytes(), frame_size)
                        total_packets_sent += 1
                        yield struct.pack(">H", len(opus_data)) + opus_data
                    except: pass
                
                # 保存调试文件
                if debug_pcm_list:
                    try:
                        full_audio = np.concatenate(debug_pcm_list)
                        sf.write("/tmp/debug_tts.wav", full_audio, 16000)
                        logger.info(f"[TTS] Debug file saved: /tmp/debug_tts.wav ({len(full_audio)/16000:.2f}s)")
                    except Exception as e:
                        logger.error(f"Failed to save debug wav: {e}")

                logger.info(f"[TTS] Finished. Received samples: {total_samples_received}, Sent packets: {total_packets_sent} ({total_packets_sent*60}ms)")

            return StreamingResponse(opus_stream(), media_type="audio/ogg", headers={"X-Model-Name": request_body.model})

        # 标准格式处理
        if "edge" in model_key:
            if request_body.response_format == "pcm":
                return StreamingResponse(edge_tts_provider.stream_generate(request_body.input, request_body.voice), media_type="audio/pcm", headers={"X-Model-Name": request_body.model})
            else:
                async def mp3_stream():
                    import edge_tts
                    c = edge_tts.Communicate(request_body.input, request_body.voice)
                    async for chunk in c.stream():
                        if chunk["type"] == "audio": yield chunk["data"]
                return StreamingResponse(mp3_stream(), media_type="audio/mpeg", headers={"X-Model-Name": request_body.model})
        
        elif "kokoro" in model_key:
            p = KokoroProvider()
            audio_np = p.generate(request_body.input, voice=request_body.voice)
            output_path = os.path.join(tempfile.gettempdir(), f"kokoro_{uuid.uuid4()}.wav")
            sf.write(output_path, audio_np, 24000)
        
        elif "qwen" in model_key:
            mode = "design"
            if temp_ref_path:
                mode = "clone"
            elif request_body.voice and request_body.voice != "None":
                mode = "custom"
            p = QwenTTSProvider(mode=mode)
            if request_body.response_format == "pcm":
                return StreamingResponse(
                    p.stream_generate(request_body.input, voice=request_body.voice, instruct=request_body.instruct, ref_audio=temp_ref_path, ref_text=request_body.ref_text), 
                    media_type="audio/pcm", 
                    headers={"X-Model-Name": request_body.model}
                )
            output_path = p.generate(request_body.input, voice=request_body.voice, instruct=request_body.instruct, ref_audio=temp_ref_path, ref_text=request_body.ref_text)

        elif "omni" in model_key: output_path = omni_provider.generate(request_body.input)
        elif "vox" in model_key: output_path = voxcpm_provider.generate(request_body.input)
        else: raise HTTPException(status_code=400, detail=f"Unsupported model: {request_body.model}")

        if output_path and os.path.exists(output_path):
            return FileResponse(output_path, media_type="audio/wav", background=BackgroundTask(os.remove, output_path), headers={"X-Model-Name": request_body.model})
        raise HTTPException(status_code=500, detail="Failed to generate audio")

    except Exception as e:
        logger.error(f"[TTS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_ref_path and os.path.exists(temp_ref_path):
            try:
                os.remove(temp_ref_path)
            except:
                pass

from pydantic import BaseModel

class SpeakerSpeechRequest(BaseModel):
    speaker_id: str
    text: str
    response_format: str = "mp3"


@router.post("/speech/speaker")
async def speech_by_speaker(request_body: SpeakerSpeechRequest, request: Request):
    from app.core.database import db
    sp = db.get_speaker(request_body.speaker_id)
    if not sp:
        raise HTTPException(status_code=404, detail="Speaker not found")
        
    # 重组参数调用底层的 speech 逻辑
    from app.schemas.openai import SpeechRequest
    # 如果是 opus，则请求 opus，其它则按传入格式生成
    speech_req = SpeechRequest(
        model="auto",
        input=request_body.text,
        voice=sp["voice_id"],
        response_format=request_body.response_format
    )
    return await speech(speech_req, request)


@router.post("/transcriptions")
async def transcribe(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form("sensevoice")
):
    request.state.model_name = model
    logger.info(f"[ASR] Request received. File: {file.filename}, Content-Type: {file.content_type}, Model: {model}")
    
    temp_path = None
    try:
        # 保存到临时文件
        suffix = os.path.splitext(file.filename)[1] if file.filename else ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_path = tmp.name

        model_key = model.lower()
        text = ""

        if "sensevoice" in model_key:
            import librosa
            data, sr = librosa.load(temp_path, sr=16000)
            result = sensevoice_provider.transcribe(data)
            text = result.get("text", "")
        elif "vosk" in model_key:
            import librosa
            data, sr = librosa.load(temp_path, sr=16000)
            pcm_bytes = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
            text = vosk_provider.transcribe(pcm_bytes)
        elif "qwen" in model_key:
            text = qwen_asr_provider.transcribe(temp_path)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported ASR model: {model}")
        
        logger.info(f"[ASR] Transcription result: {text}")
        resp = TranscriptionResponse(text=text)
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content=resp.model_dump(),
            headers={"X-Model-Name": model},
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ASR] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and os.path.exists(temp_path):
            try: os.remove(temp_path)
            except: pass

@router.post("/vad")
async def voice_activity_detection(
    request: Request,
    file: UploadFile = File(...),
    engine: str = Form("silero"),
    threshold: float = Form(0.02),
    sensitivity: int = Form(2)
):
    request.state.model_name = f"vad_{engine}"
    logger.info(f"[VAD] Request received. File: {file.filename}, Engine: {engine}")

    temp_path = None
    import time
    start_time = time.time()
    try:
        # 在本地创建永久音频库
        save_dir = "temp_audio"
        os.makedirs(save_dir, exist_ok=True)
        
        # 统一使用原始名字或带时间戳的 wav 格式
        orig_ext = os.path.splitext(file.filename)[1] if file.filename else ".webm"
        filename = f"vad_{int(time.time())}_{uuid.uuid4().hex[:8]}{orig_ext}"
        temp_path = os.path.join(save_dir, filename)

        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)

        import librosa
        data, sr = librosa.load(temp_path, sr=16000)

        # 如果原本不是 wav，转换为标准 wav 方便用户在本地播放和调试
        if orig_ext.lower() != ".wav":
            wav_path = os.path.splitext(temp_path)[0] + ".wav"
            import soundfile as sf
            sf.write(wav_path, data, 16000)
            logger.info(f"[VAD] Transcoded source file to wav: {wav_path}")

        engine_key = engine.lower()
        if "energy" in engine_key:
            provider = EnergyVADProvider(threshold=threshold)
            segments = provider.segments(data, sample_rate=16000)
        elif "webrtc" in engine_key:
            provider = WebRTCVADProvider(mode=sensitivity)
            segments = provider.segments(data, sample_rate=16000)
        elif "silero" in engine_key:
            segments = silero_vad_provider.segments(data, sample_rate=16000)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported VAD engine: {engine}")

        duration = time.time() - start_time
        return {
            "engine": engine,
            "segments": segments,
            "process_time_ms": round(duration * 1000, 2)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[VAD] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # 为了保留本地文件，此处仅在出错且文件确实生成时尝试清理，平时正常请求时选择保留文件在 temp_audio 中
        pass

