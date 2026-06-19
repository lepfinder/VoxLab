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

router = APIRouter(prefix="/v1/audio")
logger = logging.getLogger(__name__)

# 实例化提供者
sensevoice_provider = SenseVoiceProvider()
vosk_provider = VoskProvider()
qwen_asr_provider = QwenASRProvider()

edge_tts_provider = EdgeTTSProvider()
omni_provider = OmniVoiceProvider()
voxcpm_provider = VoxCPMProvider()

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

@router.post("/speech")
async def speech(request_body: SpeechRequest, request: Request):
    request.state.model_name = request_body.model
    model_key = request_body.model.lower()
    output_path = None
    audio_bytes = None

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
                    provider = QwenTTSProvider(mode="custom" if request_body.voice and request_body.voice != "None" else "design")
                    for chunk in provider.stream_generate(request_body.input, voice=request_body.voice):
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
            p = QwenTTSProvider(mode="custom" if request_body.voice != "None" else "design")
            if request_body.response_format == "pcm":
                return StreamingResponse(p.stream_generate(request_body.input, voice=request_body.voice), media_type="audio/pcm", headers={"X-Model-Name": request_body.model})
            output_path = p.generate(request_body.input, voice=request_body.voice)

        elif "omni" in model_key: output_path = omni_provider.generate(request_body.input)
        elif "vox" in model_key: output_path = voxcpm_provider.generate(request_body.input)
        else: raise HTTPException(status_code=400, detail=f"Unsupported model: {request_body.model}")

        if output_path and os.path.exists(output_path):
            return FileResponse(output_path, media_type="audio/wav", background=BackgroundTask(os.remove, output_path), headers={"X-Model-Name": request_body.model})
        raise HTTPException(status_code=500, detail="Failed to generate audio")

    except Exception as e:
        logger.error(f"[TTS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

        # 使用 librosa 加载音频（兼容性更好）
        import librosa
        data, sr = librosa.load(temp_path, sr=16000)
            
        # 调用 SenseVoice Provider
        result = sensevoice_provider.transcribe(data)
        
        logger.info(f"[ASR] Transcription result: {result.get('text')}")
        resp = TranscriptionResponse(text=result.get("text", ""))
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content=resp.model_dump(),
            headers={"X-Model-Name": model},
        )
        
    except Exception as e:
        logger.error(f"[ASR] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and os.path.exists(temp_path):
            try: os.remove(temp_path)
            except: pass
