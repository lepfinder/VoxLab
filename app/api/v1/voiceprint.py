import os
import tempfile
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(prefix="/api/v1/voiceprint")
logger = logging.getLogger(__name__)

# 直接使用已有的 VoiceprintProvider，它使用 ModelScope ERes2NetV2 模型
from app.providers.voiceprint_provider import VoiceprintProvider
_provider = VoiceprintProvider()


@router.post("/extract")
async def extract_voiceprint(file: UploadFile = File(...)):
    """
    提取音频文件中的声纹特征向量
    """
    try:
        content = await file.read()

        import torchaudio

        # 从文件名推断格式后缀
        original_name = file.filename or "audio.webm"
        ext = os.path.splitext(original_name)[-1] or ".webm"

        # 写入临时文件，让 torchaudio 正确解码
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            logger.info(f"[Voiceprint] Extracting from: {original_name} ({len(content)} bytes)")
            # VoiceprintProvider.extract 接受音频文件路径
            embedding = _provider.extract(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        if embedding is not None:
            logger.info(f"[Voiceprint] Embedding extracted: {len(embedding)} dims")
            return {"embedding": embedding}
        else:
            raise HTTPException(status_code=500, detail="Could not extract speaker embedding from audio")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Voiceprint] Extraction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
