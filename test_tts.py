import numpy as np
from mlx_audio.tts.utils import load_model

model_id = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit"
try:
    model = load_model(model_id)
    print(f"Model sample rate: {model.sample_rate}")
    
    gen_kwargs = {
        "text": "你好",
        "stream": True,
        "streaming_interval": 0.5,
    }
    results = model.generate(**gen_kwargs)
    for i, result in enumerate(results):
        print(f"Chunk {i}: {len(result.audio)} samples")
        break
except Exception as e:
    print(f"Error: {e}")
