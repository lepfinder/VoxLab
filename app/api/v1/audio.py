"""
TTS（语音合成）相关 HTTP 接口
- POST /api/v1/audio/speech          文本转语音（支持多引擎 + Opus/PCM/MP3/WAV）
- POST /api/v1/audio/speech/speaker  按 Speaker ID 进行语音合成
"""
import io
import os
import uuid
import tempfile
import struct
import logging
import numpy as np
import soundfile as sf
import opuslib
from fastapi import APIRouter, HTTPException, Response, Request
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from app.schemas.openai import SpeechRequest
from app.providers.tts.edge_tts_provider import EdgeTTSProvider
from app.providers.tts.kokoro_provider import KokoroProvider
from app.providers.tts.qwen_tts_provider import QwenTTSProvider
from app.providers.tts.omni_provider import OmniVoiceProvider
from app.providers.tts.voxcpm_provider import VoxCPMProvider

router = APIRouter(prefix="/api/v1/audio")
logger = logging.getLogger(__name__)

# 实例化 TTS 提供者（模块级单例）
edge_tts_provider = EdgeTTSProvider()
omni_provider = OmniVoiceProvider()
voxcpm_provider = VoxCPMProvider()


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
    temp_ref_path = None

    # 处理 base64 参考音频
    if request_body.ref_audio:
        import base64
        ref_data = request_body.ref_audio
        if "," in ref_data:
            ref_data = ref_data.split(",", 1)[1]
        try:
            decoded_bytes = base64.b64decode(ref_data)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp.write(decoded_bytes)
                temp_ref_path = tmp.name
            logger.info(f"[TTS] Decoded base64 ref_audio, saved to: {temp_ref_path}")
        except Exception as e:
            logger.error(f"[TTS] Failed to decode base64 ref_audio: {e}")

    logger.info(f"[TTS] Model: {request_body.model}, Format: {request_body.response_format}, Text: {request_body.input[:50]}...")

    try:
        # ── Opus 流式格式（对接硬件）──────────────────────────────────────────
        if request_body.response_format == "opus":
            async def opus_stream():
                encoder = opuslib.Encoder(16000, 1, opuslib.APPLICATION_VOIP)
                frame_size = 960  # 60ms
                pcm_accum = np.array([], dtype=np.int16)
                total_samples_received = 0
                total_packets_sent = 0
                debug_pcm_list = []

                logger.info(f"[TTS] Starting streaming Opus encoding for: {request_body.input[:30]}...")

                async def process_pcm_chunk(chunk_bytes):
                    nonlocal pcm_accum, total_samples_received, total_packets_sent, debug_pcm_list
                    if not chunk_bytes:
                        return
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

                # 获取 PCM 数据并实时编码
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
                    # 非流式模型
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
                        if "omni" in model_key:
                            path = omni_provider.generate(request_body.input)
                        elif "vox" in model_key:
                            path = voxcpm_provider.generate(request_body.input)
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

                # 处理尾部剩余帧
                if len(pcm_accum) > 0:
                    pad_size = frame_size - len(pcm_accum)
                    final_frame = np.concatenate([pcm_accum, np.zeros(pad_size, dtype=np.int16)])
                    try:
                        opus_data = encoder.encode(final_frame.tobytes(), frame_size)
                        total_packets_sent += 1
                        yield struct.pack(">H", len(opus_data)) + opus_data
                    except:
                        pass

                # 保存调试 WAV
                if debug_pcm_list:
                    try:
                        full_audio = np.concatenate(debug_pcm_list)
                        sf.write("/tmp/debug_tts.wav", full_audio, 16000)
                        logger.info(f"[TTS] Debug file saved: /tmp/debug_tts.wav ({len(full_audio)/16000:.2f}s)")
                    except Exception as e:
                        logger.error(f"Failed to save debug wav: {e}")

                logger.info(f"[TTS] Finished. Received samples: {total_samples_received}, Sent packets: {total_packets_sent} ({total_packets_sent*60}ms)")

            return StreamingResponse(opus_stream(), media_type="audio/ogg", headers={"X-Model-Name": request_body.model})

        # ── 标准格式处理 ──────────────────────────────────────────────────────
        if "edge" in model_key:
            if request_body.response_format == "pcm":
                return StreamingResponse(
                    edge_tts_provider.stream_generate(request_body.input, request_body.voice),
                    media_type="audio/pcm",
                    headers={"X-Model-Name": request_body.model}
                )
            else:
                async def mp3_stream():
                    import edge_tts
                    c = edge_tts.Communicate(request_body.input, request_body.voice)
                    async for chunk in c.stream():
                        if chunk["type"] == "audio":
                            yield chunk["data"]
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
                    p.stream_generate(
                        request_body.input,
                        voice=request_body.voice,
                        instruct=request_body.instruct,
                        ref_audio=temp_ref_path,
                        ref_text=request_body.ref_text
                    ),
                    media_type="audio/pcm",
                    headers={"X-Model-Name": request_body.model}
                )
            output_path = p.generate(
                request_body.input,
                voice=request_body.voice,
                instruct=request_body.instruct,
                ref_audio=temp_ref_path,
                ref_text=request_body.ref_text
            )

        elif "omni" in model_key:
            output_path = omni_provider.generate(request_body.input)
        elif "vox" in model_key:
            output_path = voxcpm_provider.generate(request_body.input)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported model: {request_body.model}")

        if output_path and os.path.exists(output_path):
            return FileResponse(
                output_path,
                media_type="audio/wav",
                background=BackgroundTask(os.remove, output_path),
                headers={"X-Model-Name": request_body.model}
            )
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

    speech_req = SpeechRequest(
        model="auto",
        input=request_body.text,
        voice=sp["voice_id"],
        response_format=request_body.response_format
    )
    return await speech(speech_req, request)
