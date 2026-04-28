import time
import logging
import threading
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class ModelManager:
    """
    单例模型管理器，负责模型的延迟加载、自动卸载和状态管理。
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ModelManager, cls).__new__(cls)
                cls._instance._initialized = False
        return cls._instance

    def __init__(self, ttl_seconds: int = 600): # 默认 10 分钟未使用则卸载
        if self._initialized:
            return
        
        self._loaded_models: Dict[str, Dict[str, Any]] = {}
        self._model_locks: Dict[str, threading.Lock] = {}
        self.ttl_seconds = ttl_seconds
        self._initialized = True
        
        # 启动后台清理线程
        self._stop_event = threading.Event()
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleanup_thread.start()
        
        logger.info(f"ModelManager initialized with TTL: {ttl_seconds}s.")

    def _cleanup_loop(self):
        """后台循环，检查并清理过期的模型"""
        while not self._stop_event.is_set():
            time.sleep(60) # 每分钟检查一次
            now = time.time()
            to_unload = []
            
            with self._lock:
                for model_id, info in self._loaded_models.items():
                    idle_time = now - info.get("last_used", 0)
                    if idle_time > self.ttl_seconds:
                        to_unload.append(model_id)
            
            for model_id in to_unload:
                logger.info(f"Auto-unloading idle model: {model_id} (idle for >{self.ttl_seconds}s)")
                self.unload_model(model_id)

    def get_model(self, model_id: str, loader_fn: callable, *args, **kwargs) -> Any:
        """
        获取模型，如果未加载则调用 loader_fn 进行加载。
        """
        if model_id not in self._model_locks:
            self._model_locks[model_id] = threading.Lock()

        with self._model_locks[model_id]:
            if model_id in self._loaded_models:
                logger.debug(f"Model '{model_id}' found in cache.")
                self._loaded_models[model_id]["last_used"] = time.time()
                return self._loaded_models[model_id]["model"]

            # 执行加载
            logger.info(f"Loading model '{model_id}'...")
            start_time = time.time()
            try:
                model_obj = loader_fn(*args, **kwargs)
                self._loaded_models[model_id] = {
                    "model": model_obj,
                    "last_used": time.time(),
                    "load_time": time.time() - start_time
                }
                logger.info(f"Model '{model_id}' loaded successfully in {self._loaded_models[model_id]['load_time']:.2f}s.")
                return model_obj
            except Exception as e:
                logger.error(f"Failed to load model '{model_id}': {e}")
                raise e

    def unload_model(self, model_id: str):
        """
        手动卸载模型以释放内存。
        """
        with self._lock:
            if model_id in self._loaded_models:
                del self._loaded_models[model_id]
                import gc
                gc.collect() # 建议进行垃圾回收
                logger.info(f"Model '{model_id}' unloaded.")

    def list_loaded_models(self):
        return list(self._loaded_models.keys())

# 全局单例
model_manager = ModelManager()
