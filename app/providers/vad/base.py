import numpy as np

class BaseVADProvider:
    def segments(self, audio_data: np.ndarray, sample_rate: int = 16000) -> list[dict]:
        """
        根据音频数据检测人声区间
        :param audio_data: 浮点型单声道 numpy 数组 (范围 -1.0 到 1.0)
        :param sample_rate: 采样率，默认 16000
        :return: 包含时间区间的列表，格式如 [{"start": float, "end": float}]
        """
        raise NotImplementedError
