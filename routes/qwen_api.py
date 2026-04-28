import os
import tempfile
import uuid
import logging
import subprocess
import datetime
import random
import shutil
import re
import wave
import torch
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter()

qwen_asr_model = None
qwen_tts_model = None

@router.post("/qwen_asr")
async def qwen_asr_handler(file: UploadFile = File(...)):
    from config import MODELS
    from mlx_audio.stt.utils import load_model
    from mlx_audio.stt.generate import generate_transcription
    
    if qwen_asr_model is None:
        try:
            model_id = MODELS["qwen_asr"]
            logger.info(f"Loading Qwen3-ASR model: {model_id}...")
            qwen_asr_model = load_model(model_id)
        except Exception as e:
            return {"error": f"Failed to load Qwen3-ASR model: {str(e)}"}
            
    temp_in = os.path.join(tempfile.gettempdir(), f"qwen_in_{uuid.uuid4()}.wav")
    temp_out = os.path.join(tempfile.gettempdir(), f"qwen_out_{uuid.uuid4()}.txt")
    
    with open(temp_in, "wb") as f:
        f.write(await file.read())
        
    try:
        # 预处理：使用 ffmpeg 转换为标准的 16k 单声道 WAV
        temp_norm = os.path.join(tempfile.gettempdir(), f"qwen_norm_{uuid.uuid4()}.wav")
        subprocess.run([
            "ffmpeg", "-y", "-i", temp_in, 
            "-ar", "16000", "-ac", "1", "-f", "wav", 
            temp_norm
        ], check=True, capture_output=True)
        
        # 保存一份到 data/input 目录供以后分析
        import datetime
        import random
        import shutil
        data_input_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "input")
        os.makedirs(data_input_dir, exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        random_num = random.randint(1000, 9999)
        # 获取原始文件后缀，如果没有则默认 .wav
        ext = os.path.splitext(file.filename)[1] if file.filename else ".wav"
        save_path = os.path.join(data_input_dir, f"{timestamp}_{random_num}{ext}")
        shutil.copy(temp_in, save_path)
        logger.info(f"[QwenASR] Saved input audio copy to: {save_path}")

        # --- 新增：声纹提取 ---
        try:
            from routes.voiceprint_api import get_pipeline
            import torchaudio
            import torch
            import numpy as np

            spk_embedding = None
            
            # 使用与 voiceprint_api 一致的本地临时目录
            vp_temp_dir = os.path.join(os.getcwd(), "temp_audio")
            if not os.path.exists(vp_temp_dir):
                os.makedirs(vp_temp_dir)
            
            vp_norm_path = os.path.join(vp_temp_dir, f"asr_vp_{uuid.uuid4()}.wav")
            
            # 预处理：16k 单声道
            subprocess.run(["ffmpeg", "-y", "-i", temp_in, "-ar", "16000", "-ac", "1", vp_norm_path], check=True, capture_output=True)
            
            if os.path.exists(vp_norm_path):
                p = get_pipeline()
                
                # 1. 优先尝试直接模型推理 (同步 voiceprint_api 逻辑)
                wav, sr = torchaudio.load(vp_norm_path)
                if wav.shape[0] > 1:
                    wav = wav[0:1, :]
                
                model_obj = getattr(p, 'model', None) or getattr(p, '_model', None)
                if model_obj is not None:
                    with torch.no_grad():
                        embedding_tensor = model_obj(wav)
                        embedding = embedding_tensor.cpu().numpy()
                else:
                    # 2. 备选：使用 pipeline 调用
                    result = p(vp_norm_path)
                    res_dict = result[0] if isinstance(result, list) else result
                    embedding = res_dict.get("spk_embedding") or res_dict.get("embedding")

                if embedding is not None:
                    if isinstance(embedding, torch.Tensor):
                        spk_embedding = embedding.cpu().numpy().flatten().tolist()
                    elif isinstance(embedding, np.ndarray):
                        spk_embedding = embedding.flatten().tolist()
                    else:
                        spk_embedding = embedding
                    logger.info(f"[QwenASR] Voiceprint match success, length: {len(spk_embedding)}")
                
                if os.path.exists(vp_norm_path): os.remove(vp_norm_path)
            else:
                logger.error(f"[QwenASR] Failed to create normalized audio at {vp_norm_path}")

        except Exception as ve:
            import traceback
            logger.error(f"[QwenASR] Voiceprint extraction failed trace: {traceback.format_exc()}")
        # --------------------

        transcription = generate_transcription(
            model=qwen_asr_model,
            audio=temp_norm,
            output_path=temp_out,
            format="txt",
            verbose=False
        )
        text = transcription.text if hasattr(transcription, 'text') else str(transcription)
        logger.info(f"ASR (Qwen3) Result: {text}")
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        logger.error(f"Qwen ASR error: {err_msg}")
        return {"error": str(e)}
    finally:
        if os.path.exists(temp_in): os.remove(temp_in)
        if 'temp_norm' in locals() and os.path.exists(temp_norm): os.remove(temp_norm)
        if os.path.exists(temp_out): os.remove(temp_out)
            
    return {"text": text, "spk_embedding": spk_embedding}


@router.post("/qwen_tts")
async def qwen_tts_handler(
    text: str = Form(...), 
    ref_audio: Optional[UploadFile] = File(None),
    ref_text: Optional[str] = Form(None),
    instruct: Optional[str] = Form(None),
    voice: Optional[str] = Form(None)
):
    from config import MODELS
    from mlx_audio.tts.utils import load_model
    from mlx_audio.tts.generate import generate_audio
    
    # 根据是否有指定音色决定加载哪个模型
    if voice and voice != "None":
        model_id = MODELS["qwen_tts_custom"]
    else:
        model_id = MODELS["qwen_tts_design"]

    if qwen_tts_model is None:
        try:
            logger.info(f"Loading Qwen3-TTS model: {model_id}...")
            qwen_tts_model = load_model(model_id)
        except Exception as e:
            return {"error": f"Failed to load Qwen3-TTS model: {str(e)}"}
            
    temp_dir = tempfile.gettempdir()
    file_prefix = os.path.join(temp_dir, f"qwen_tts_{uuid.uuid4()}")
    ref_path = None
    
    if ref_audio is not None and ref_audio.size > 0:
        ref_path = os.path.join(temp_dir, f"ref_{uuid.uuid4()}.wav")
        with open(ref_path, "wb") as f:
            f.write(await ref_audio.read())

    try:
        # 确定生成模式
        final_instruct = instruct if (instruct and instruct.strip()) else "A natural speech."

        gen_kwargs = {
            "model": qwen_tts_model,
            "text": text,
            "file_prefix": file_prefix,
            "join_audio": True,
        }
        
        if ref_path:
            gen_kwargs["ref_audio"] = ref_path
            gen_kwargs["ref_text"] = ref_text
            gen_kwargs["instruct"] = final_instruct
        elif voice and voice != "None":
            gen_kwargs["voice"] = voice
            # CustomVoice 模式通常也需要一个基础 instruct
            gen_kwargs["instruct"] = final_instruct
        else:
            # 默认兜底：如果没有参考音频也没有指定音色，使用基础捏人模式
            gen_kwargs["instruct"] = final_instruct

        logger.debug(f"Qwen3 Generation with {gen_kwargs.get('voice', 'Cloning/Design mode')}")
        generate_audio(**gen_kwargs)
        
        out_file = file_prefix + ".wav"
        
        if not os.path.exists(out_file):
            raise FileNotFoundError(f"Output file was not created by generate_audio: {out_file}")
        
        # 同时保存一份到 data 目录
        import datetime
        import random
        import shutil
        data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
        os.makedirs(data_dir, exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        random_num = random.randint(1000, 9999)
        save_path = os.path.join(data_dir, f"{timestamp}_{random_num}.wav")
        shutil.copy(out_file, save_path)
        logger.info(f"[QwenTTS] Saved audio copy to: {save_path}")
        
        def cleanup():
            if os.path.exists(out_file): os.remove(out_file)
            if os.path.exists(ref_path): os.remove(ref_path)
                
        return FileResponse(
            out_file, 
            media_type="audio/wav", 
            background=BackgroundTask(cleanup)
        )
    except Exception as e:
        if os.path.exists(ref_path): os.remove(ref_path)
        return {"error": f"Qwen TTS error: {str(e)}"}


@router.post("/qwen_tts_stream")
async def qwen_tts_stream_handler(
    text: str = Form(...), 
    voice: Optional[str] = Form("Ethan"),
    instruct: Optional[str] = Form("A natural speech.")
):
    from fastapi.responses import StreamingResponse
    from config import MODELS
    from mlx_audio.tts.utils import load_model
    
    # 常见预置音色检测
    preset_voices = ["Serena", "Uncle Fu", "Vivian", "Aiden", "Ryan", "Ono Anna", "Sohee", "Dylan", "Eric"]
    if voice in preset_voices:
        model_id = MODELS["qwen_tts_custom"]
    else:
        model_id = MODELS["qwen_tts_design"]

    if qwen_tts_model is None:
        logger.info(f"[QwenTTS] Loading model for stream: {model_id}")
        qwen_tts_model = load_model(model_id)

    # 过滤 Emoji
    clean_text = re.sub(r'[^\u0000-\uD7FF\uE000-\uFFFF]', '', text)
    if not clean_text.strip():
        clean_text = text

    collected_chunks = []

    async def audio_generator():
        # 设置流式参数
        gen_kwargs = {
            "model": qwen_tts_model,
            "text": clean_text,
            "voice": voice,
            "instruct": instruct,
            "stream": True,
            "streaming_interval": 0.5,
        }
        
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=1)
        
        def get_results():
            return qwen_tts_model.generate(**gen_kwargs)

        results = await loop.run_in_executor(executor, get_results)
        
        for result in results:
            import numpy as np
            audio_data = np.array(result.audio)
            src_rate = result.sample_rate # 通常是 24000
            
            # 确保是 16bit PCM
            if audio_data.dtype != np.int16:
                # 归一化处理（如果模型输出是 float32）
                if audio_data.dtype == np.float32 or audio_data.dtype == np.float64:
                    audio_data = (audio_data * 32767).astype(np.int16)
                else:
                    audio_data = audio_data.astype(np.int16)
            
            # 如果采样率不是 16000，进行重采样
            if src_rate != 16000:
                from scipy import signal
                # 计算目标样本数
                num_samples = int(len(audio_data) * 16000 / src_rate)
                audio_data = signal.resample(audio_data, num_samples).astype(np.int16)
            
            chunk_bytes = audio_data.tobytes()
            collected_chunks.append(chunk_bytes)
            yield chunk_bytes
            await asyncio.sleep(0)
        
        # 流结束后保存到文件供排查
        if collected_chunks:
            try:
                full_audio = b"".join(collected_chunks)
                compare_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "output16k")
                os.makedirs(compare_dir, exist_ok=True)
                
                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
                random_num = random.randint(1000, 9999)
                save_path = os.path.join(compare_dir, f"{timestamp}_{random_num}_qwen.wav")
                
                with wave.open(save_path, 'wb') as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2) # 16bit
                    wf.setframerate(16000)
                    wf.writeframes(full_audio)
                logger.info(f"[QwenTTS] Stream finished, saved copy to: {save_path}")
            except Exception as e:
                logger.error(f"[QwenTTS] Failed to save stream copy: {e}")

    return StreamingResponse(audio_generator(), media_type="audio/pcm")
