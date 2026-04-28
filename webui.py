import gradio as gr
import httpx
import os

async def test_asr(audio_path, model_type):
    if not audio_path:
        return "请先录制或上传音频"
        
    if model_type == "SenseVoice (推荐)":
        url = "http://127.0.0.1:8001/funasr"
    elif model_type == "Qwen3 ASR (4bit)":
        url = "http://127.0.0.1:8001/qwen_asr"
    else:
        url = "http://127.0.0.1:8001/asr"
    
    try:
        # 将文件读取为二进制并发送多部分表单请求
        with open(audio_path, "rb") as f:
            files = {"file": ("audio.wav", f, "audio/wav")}
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(url, files=files)
                response.raise_for_status()
                data = response.json()
                
                if "error" in data:
                    return f"服务端报错: {data['error']}"
                return data.get("text", "无识别结果")
    except httpx.ConnectError:
        return "请求失败：无法连接到后端服务。请确保 `python main.py` (AI Server) 正在 8001 端口运行！"
    except Exception as e:
        return f"发生异常: {str(e)}"

async def test_tts(text, provider, voice_name, ref_audio_path, ref_text):
    import os
    import tempfile
    import uuid

    if not text.strip():
        return None, "❌ 请输入要合成的文本"
        
    if provider == "Qwen3 TTS (本地)":
        url = "http://127.0.0.1:8001/qwen_tts"
        try:
            # 根据 voice_name 是否包含 Emoji 判断它是内置音色还是捏人 Prompt
            is_custom_voice = any(v[0] == voice_name for v in QWEN_CUSTOM_VOICES)
            
            data = {
                "text": text, 
                "ref_text": ref_text,
                "instruct": voice_name if not is_custom_voice else "A natural speech.",
                "voice": voice_name if is_custom_voice else "None"
            }
            
            files = {}
            if ref_audio_path:
                f = open(ref_audio_path, "rb")
                files = {"ref_audio": ("ref.wav", f, "audio/wav")}
            else:
                f = None
                
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(url, data=data, files=files if files else None)
                if f: f.close()
                response.raise_for_status()
                    
                if "error" in response.text:
                    return None, f"服务端报错: {response.text}"
                    
                temp_file = os.path.join(tempfile.gettempdir(), f"gradio_{uuid.uuid4()}.wav")
                with open(temp_file, "wb") as out_f:
                    out_f.write(response.content)
                return temp_file, "✅ 合成成功！"
        except httpx.ConnectError:
            return None, "请求失败：无法连接到后端服务。请确保 `python main.py` 正在 8001 端口运行！"
        except Exception as e:
            return None, f"发生异常: {str(e)}"
            
    if provider == "OmniVoice (本地)":
        url = "http://127.0.0.1:8001/omni_tts"
        try:
            data = {
                "text": text, 
                "instruct": voice_name if "请忽略" not in voice_name else "",
                "ref_text": ref_text
            }
            files = {}
            if ref_audio_path:
                # If the user uploads an audio, we must open it and keep it open during the request
                f = open(ref_audio_path, "rb")
                files = {"ref_audio": ("ref.wav", f, "audio/wav")}
            else:
                f = None
                
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(url, data=data, files=files if files else None)
                if f:
                    f.close()
                response.raise_for_status()
                
                if "error" in response.text:
                    return None, f"服务端报错: {response.text}"
                    
                temp_file = os.path.join(tempfile.gettempdir(), f"gradio_{uuid.uuid4()}.wav")
                with open(temp_file, "wb") as out_f:
                    out_f.write(response.content)
                return temp_file, "✅ 合成成功！"
        except httpx.ConnectError:
            return None, "请求失败：无法连接到后端服务。请确保 `python main.py` 正在 8001 端口运行！"
        except Exception as e:
            return None, f"发生异常: {str(e)}"

    if provider == "VoxCPM (本地)":
        url = "http://127.0.0.1:8001/voxcpm"
        try:
            data = {"text": text, "instruct": voice_name if "请忽略" not in voice_name else ""}
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(url, data=data)
                response.raise_for_status()
                
                if "error" in response.text:
                    return None, f"服务端报错: {response.text}"
                    
                temp_file = os.path.join(tempfile.gettempdir(), f"gradio_{uuid.uuid4()}.wav")
                with open(temp_file, "wb") as out_f:
                    out_f.write(response.content)
                return temp_file, "✅ 合成成功！"
        except httpx.ConnectError:
            return None, "请求失败：无法连接到后端服务。请确保 `python main.py` 正在 8001 端口运行！"
        except Exception as e:
            return None, f"发生异常: {str(e)}"

    # Edge-TTS 和 Kokoro TTS 逻辑
    url = "http://127.0.0.1:8001/tts" if provider == "Edge-TTS (在线)" else "http://127.0.0.1:8001/kokoro"
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # 使用 data= 而不是 json= 以发送 Form 数据，防止 422 错误
            response = await client.post(url, data={"text": text, "voice": voice_name})
            response.raise_for_status()
            
            # 将服务器返回的音频流保存为临时文件供前端播放
            # Edge-TTS 返回的是 mp3，Kokoro 返回的是 wav
            ext = ".mp3" if provider == "Edge-TTS (在线)" else ".wav"
            temp_file = os.path.join(tempfile.gettempdir(), f"gradio_{uuid.uuid4()}{ext}")
            with open(temp_file, "wb") as f:
                f.write(response.content)
            return temp_file, "✅ 合成成功！"
    except httpx.ConnectError:
        return None, "请求失败：无法连接到后端服务。请确保 `python main.py` 正在 8001 端口运行！"
    except Exception as e:
        return None, f"发生异常: {str(e)}"

# 使用 Gradio Blocks 构建美观的界面
with gr.Blocks(title="HomeCore AI Server 测试工作台", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🎙️ HomeCore AI Server 本地测试工作台")
    gr.Markdown("这是一个独立的 Web UI 工具，用于直接在浏览器里测试您的后端 AI 接口。\n\n**前置要求**：请确保底层的 `python main.py` 服务已经在运行，并且监听在 `8001` 端口。")
    
    with gr.Tab("🗣️ 语音识别 (ASR)"):
        with gr.Row():
            with gr.Column():
                model_dropdown = gr.Radio(
                    choices=["SenseVoice (推荐)", "Qwen3 ASR (4bit)", "Vosk (老架构)"], 
                    value="SenseVoice (推荐)", 
                    label="选择后端识别引擎"
                )
                audio_input = gr.Audio(sources=["microphone", "upload"], type="filepath", label="录制或上传音频")
                submit_btn = gr.Button("开始识别 🚀", variant="primary")
            
            with gr.Column():
                text_output = gr.Textbox(label="识别结果", lines=8, placeholder="识别出的文字会显示在这里...")
                
        submit_btn.click(fn=test_asr, inputs=[audio_input, model_dropdown], outputs=text_output)
        
    with gr.Tab("🔊 语音合成 (TTS)"):
        with gr.Row():
            with gr.Column():
                tts_text_input = gr.Textbox(label="输入文本", lines=4, placeholder="请输入要转换的文本...")
                tts_provider_radio = gr.Radio(
                    choices=["Edge-TTS (在线)", "Kokoro TTS (本地)", "Qwen3 TTS (本地)", "OmniVoice (本地)", "VoxCPM (本地)"], 
                    value="Edge-TTS (在线)", 
                    label="选择 TTS 引擎"
                )
                
                EDGE_VOICES = ["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural", "zh-CN-YunjianNeural", "zh-CN-XiaoyiNeural", "zh-CN-Liaoning-XiaobeiNeural", "zh-TW-HsiaoChenNeural"]
                KOKORO_VOICES = [
                    ('🇺🇸 🚺 Heart ❤️', 'af_heart'), ('🇺🇸 🚺 Bella 🔥', 'af_bella'), ('🇺🇸 🚺 Nicole 🎧', 'af_nicole'),
                    ('🇺🇸 🚺 Aoede', 'af_aoede'), ('🇺🇸 🚺 Kore', 'af_kore'), ('🇺🇸 🚺 Sarah', 'af_sarah'),
                    ('🇺🇸 🚺 Nova', 'af_nova'), ('🇺🇸 🚺 Sky', 'af_sky'), ('🇺🇸 🚺 Alloy', 'af_alloy'),
                    ('🇺🇸 🚺 Jessica', 'af_jessica'), ('🇺🇸 🚺 River', 'af_river'), ('🇺🇸 🚹 Michael', 'am_michael'),
                    ('🇺🇸 🚹 Fenrir', 'am_fenrir'), ('🇺🇸 🚹 Puck', 'am_puck'), ('🇺🇸 🚹 Echo', 'am_echo'),
                    ('🇺🇸 🚹 Eric', 'am_eric'), ('🇺🇸 🚹 Liam', 'am_liam'), ('🇺🇸 🚹 Onyx', 'am_onyx'),
                    ('🇺🇸 🚹 Santa', 'am_santa'), ('🇺🇸 🚹 Adam', 'am_adam'), ('🇬🇧 🚺 Emma', 'bf_emma'),
                    ('🇬🇧 🚺 Isabella', 'bf_isabella'), ('🇬🇧 🚺 Alice', 'bf_alice'), ('🇬🇧 🚺 Lily', 'bf_lily'),
                    ('🇬🇧 🚹 George', 'bm_george'), ('🇬🇧 🚹 Fable', 'bm_fable'), ('🇬🇧 🚹 Lewis', 'bm_lewis'),
                    ('🇬🇧 🚹 Daniel', 'bm_daniel'), ('🇨🇳 🚺 小贝', 'zf_xiaobei'), ('🇨🇳 🚺 小妮', 'zf_xiaoni'),
                    ('🇨🇳 🚺 小晓', 'zf_xiaoxiao'), ('🇨🇳 🚺 小艺', 'zf_xiaoyi'), ('🇨🇳 🚹 云健', 'zm_yunjian'),
                    ('🇨🇳 🚹 云希', 'zm_yunxi'), ('🇨🇳 🚹 云夏', 'zm_yunxia'), ('🇨🇳 🚹 云扬', 'zm_yunyang')
                ]
                QWEN_INSTRUCTS = ["A natural speech.", "A cheerful young female voice with high pitch.", "A mature male voice with low pitch."]
                QWEN_CUSTOM_VOICES = [
                    ("苏瑶 Serena (中文女声)", "Serena"), ("福伯 Uncle Fu (中文男声)", "Uncle Fu"),
                    ("十三 Vivian (中文女声)", "Vivian"), ("艾登 Aiden (英文男声)", "Aiden"),
                    ("甜茶 Ryan (英文男声)", "Ryan"), ("小野杏 Ono Anna (日语女声)", "Ono Anna"),
                    ("素熙 Sohee (韩语女声)", "Sohee"), ("晓东 Dylan (北京话)", "Dylan"),
                    ("程川 Eric (四川话)", "Eric")
                ]
                OMNI_VOICES = ["female, low pitch, british accent", "male, high pitch, american accent", "female, 四川话", "male, whisper"]
                VOXCPM_VOICES = ["年轻女性，声音温柔甜美，语速适中", "成熟男性，声音低沉磁性，略带严肃", "女性声音，粤语", "男声，情绪激动"]
                
                tts_voice_dropdown = gr.Dropdown(
                    choices=EDGE_VOICES,
                    value="zh-CN-XiaoxiaoNeural",
                    label="选择或手动输入发音人 / Voice Design Prompt",
                    allow_custom_value=True
                )
                
                tts_qwen_mode = gr.Radio(
                    choices=["内置精品音色", "捏人 / 音色克隆"],
                    value="内置精品音色",
                    label="Qwen3 运行模式",
                    visible=False
                )
                
                tts_ref_audio = gr.Audio(sources=["upload", "microphone"], type="filepath", label="参考音频 (Qwen3 必须, OmniVoice 可选克隆)", visible=False)
                tts_ref_text = gr.Textbox(label="参考音频内容 (可选，填写可跳过 ASR 识别)", placeholder="如果是克隆模式，填入参考音频里的文字可以显著加快速度并节省模型下载...", visible=False)
                
                def update_voices(provider, qwen_mode="内置精品音色"):
                    if provider == "Edge-TTS (在线)":
                        return gr.Dropdown(choices=EDGE_VOICES, value=EDGE_VOICES[0], label="选择发音人"), gr.Audio(visible=False), gr.Textbox(visible=False), gr.Radio(visible=False)
                    elif provider == "Kokoro TTS (本地)":
                        return gr.Dropdown(choices=KOKORO_VOICES, value=KOKORO_VOICES[0], label="选择发音人"), gr.Audio(visible=False), gr.Textbox(visible=False), gr.Radio(visible=False)
                    elif provider == "OmniVoice (本地)":
                        return gr.Dropdown(choices=OMNI_VOICES, value=OMNI_VOICES[0], label="输入 Voice Design Prompt (可选)"), gr.Audio(visible=True), gr.Textbox(visible=True), gr.Radio(visible=False)
                    elif provider == "VoxCPM (本地)":
                        return gr.Dropdown(choices=VOXCPM_VOICES, value=VOXCPM_VOICES[0], label="输入 Voice Design Prompt (描述音色、语气、方言等)"), gr.Audio(visible=False), gr.Textbox(visible=False), gr.Radio(visible=False)
                    else:
                        # Qwen3
                        if qwen_mode == "内置精品音色":
                            return gr.Dropdown(choices=QWEN_CUSTOM_VOICES, value=QWEN_CUSTOM_VOICES[0][1], label="选择内置精品音色"), gr.Audio(visible=False), gr.Textbox(visible=False), gr.Radio(visible=True)
                        else:
                            return gr.Dropdown(choices=QWEN_INSTRUCTS, value=QWEN_INSTRUCTS[0], label="输入 Voice Design Prompt (捏人描述)"), gr.Audio(visible=True), gr.Textbox(visible=True), gr.Radio(visible=True)
                        
                tts_provider_radio.change(fn=update_voices, inputs=[tts_provider_radio, tts_qwen_mode], outputs=[tts_voice_dropdown, tts_ref_audio, tts_ref_text, tts_qwen_mode], show_progress="hidden")
                tts_qwen_mode.change(fn=update_voices, inputs=[tts_provider_radio, tts_qwen_mode], outputs=[tts_voice_dropdown, tts_ref_audio, tts_ref_text, tts_qwen_mode], show_progress="hidden")
                
                tts_submit_btn = gr.Button("开始合成 🚀", variant="primary")
            
            with gr.Column():
                tts_audio_output = gr.Audio(label="合成结果", type="filepath", interactive=False)
                tts_message_output = gr.Markdown()
                
        tts_submit_btn.click(
            fn=test_tts, 
            inputs=[tts_text_input, tts_provider_radio, tts_voice_dropdown, tts_ref_audio, tts_ref_text], 
            outputs=[tts_audio_output, tts_message_output]
        )

# 如果单独运行该文件，仍然可以拉起独立服务（仅作兼容）
if __name__ == "__main__":
    print("🚀 独立运行 Web UI 测试工具...")
    print("👉 请在浏览器中打开: http://127.0.0.1:8002")
    demo.launch(server_name="0.0.0.0", server_port=8002, quiet=True)
