from abc import ABC, abstractmethod
from typing import Any

class BaseProvider(ABC):
    """
    所有模型提供者的基类。
    """
    @abstractmethod
    def load(self) -> Any:
        """加载模型的方法"""
        pass
