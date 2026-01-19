"""
模型预加载服务

在后端启动时预加载 OCR 和 LLM 模型到 GPU，避免首次请求超时
"""

import os
import subprocess
import threading
import time
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime

from app.core.config import settings


@dataclass
class ModelStatus:
    """模型状态"""
    name: str
    status: str = "not_loaded"  # not_loaded, loading, loaded, error
    progress: int = 0
    error: Optional[str] = None
    loaded_at: Optional[datetime] = None
    gpu_memory_gb: float = 0.0


@dataclass
class PreloadState:
    """预加载状态"""
    ocr_model: ModelStatus = field(default_factory=lambda: ModelStatus(name="DeepSeek-OCR"))
    llm_model: ModelStatus = field(default_factory=lambda: ModelStatus(name="Qwen3-30B"))
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    @property
    def is_ready(self) -> bool:
        """所有模型是否就绪"""
        return (
            self.ocr_model.status == "loaded" and
            self.llm_model.status == "loaded"
        )

    @property
    def is_loading(self) -> bool:
        """是否正在加载"""
        return (
            self.ocr_model.status == "loading" or
            self.llm_model.status == "loading"
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_ready": self.is_ready,
            "is_loading": self.is_loading,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "models": {
                "ocr": {
                    "name": self.ocr_model.name,
                    "status": self.ocr_model.status,
                    "progress": self.ocr_model.progress,
                    "error": self.ocr_model.error,
                    "gpu_memory_gb": self.ocr_model.gpu_memory_gb,
                },
                "llm": {
                    "name": self.llm_model.name,
                    "status": self.llm_model.status,
                    "progress": self.llm_model.progress,
                    "error": self.llm_model.error,
                }
            }
        }


# 全局预加载状态
_preload_state = PreloadState()
_preload_lock = threading.Lock()


def get_preload_state() -> PreloadState:
    """获取预加载状态"""
    return _preload_state


def _preload_ocr_model():
    """预加载 OCR 模型到 GPU"""
    global _preload_state

    with _preload_lock:
        _preload_state.ocr_model.status = "loading"
        _preload_state.ocr_model.progress = 0

    try:
        # 检查环境
        venv_python = os.path.join(settings.deepseek_ocr_venv, "bin", "python")
        if not os.path.exists(venv_python):
            raise RuntimeError(f"DeepSeek-OCR Python not found: {venv_python}")

        # 预加载脚本 - 只加载模型，不处理图片
        warmup_script = f'''
import os
import sys
os.environ["CUDA_VISIBLE_DEVICES"] = "0"

import torch
if not torch.cuda.is_available():
    print("ERROR: CUDA not available!", file=sys.stderr)
    sys.exit(1)

print("[Preload] Loading DeepSeek-OCR model...", flush=True)
print("[Preload] Progress: 10%", flush=True)

from transformers import AutoModel, AutoTokenizer

model_name = "{settings.deepseek_ocr_model}"
print("[Preload] Progress: 30%", flush=True)

tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
print("[Preload] Progress: 50%", flush=True)

model = AutoModel.from_pretrained(
    model_name,
    trust_remote_code=True,
    use_safetensors=True,
    torch_dtype=torch.bfloat16,
    device_map="cuda:0"
)
model = model.eval()
print("[Preload] Progress: 90%", flush=True)

gpu_mem = torch.cuda.memory_allocated() / 1024**3
print(f"[Preload] OCR model loaded! GPU memory: {{gpu_mem:.2f}} GB", flush=True)
print(f"[Preload] GPU_MEMORY:{{gpu_mem:.2f}}", flush=True)
print("[Preload] Progress: 100%", flush=True)

# 保持模型在内存中一段时间进行热身
import time
print("[Preload] Warming up model cache...", flush=True)
time.sleep(2)
print("[Preload] Done!", flush=True)
'''

        # 执行预加载
        process = subprocess.Popen(
            [venv_python, "-c", warmup_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace'
        )

        # 读取输出更新进度
        gpu_memory = 0.0
        for line in process.stdout:
            line = line.strip()
            print(f"[OCR-Preload] {line}")

            if "Progress:" in line:
                try:
                    progress = int(line.split("Progress:")[1].strip().replace("%", ""))
                    with _preload_lock:
                        _preload_state.ocr_model.progress = progress
                except:
                    pass

            if "GPU_MEMORY:" in line:
                try:
                    gpu_memory = float(line.split("GPU_MEMORY:")[1].strip())
                except:
                    pass

        process.wait()

        if process.returncode == 0:
            with _preload_lock:
                _preload_state.ocr_model.status = "loaded"
                _preload_state.ocr_model.progress = 100
                _preload_state.ocr_model.loaded_at = datetime.now()
                _preload_state.ocr_model.gpu_memory_gb = gpu_memory
            print(f"[Preload] OCR model loaded successfully ({gpu_memory:.2f} GB)")
        else:
            raise RuntimeError(f"OCR preload failed with code {process.returncode}")

    except Exception as e:
        print(f"[Preload] OCR model load error: {e}")
        with _preload_lock:
            _preload_state.ocr_model.status = "error"
            _preload_state.ocr_model.error = str(e)


def _preload_llm_model():
    """预加载 LLM 模型 (通过 Ollama)"""
    global _preload_state

    with _preload_lock:
        _preload_state.llm_model.status = "loading"
        _preload_state.llm_model.progress = 0

    try:
        import httpx

        ollama_base = settings.ollama_api_base.rstrip("/v1").rstrip("/")
        model_name = settings.ollama_model

        print(f"[Preload] Warming up Ollama model: {model_name}")

        with _preload_lock:
            _preload_state.llm_model.progress = 30

        # 发送一个简单请求来预热模型
        response = httpx.post(
            f"{ollama_base}/api/generate",
            json={
                "model": model_name,
                "prompt": "Hello",
                "stream": False,
                "options": {"num_predict": 1}
            },
            timeout=300  # 5分钟超时，首次加载可能很慢
        )

        with _preload_lock:
            _preload_state.llm_model.progress = 90

        if response.status_code == 200:
            with _preload_lock:
                _preload_state.llm_model.status = "loaded"
                _preload_state.llm_model.progress = 100
                _preload_state.llm_model.loaded_at = datetime.now()
            print(f"[Preload] LLM model loaded successfully")
        else:
            raise RuntimeError(f"Ollama returned {response.status_code}: {response.text}")

    except Exception as e:
        print(f"[Preload] LLM model load error: {e}")
        with _preload_lock:
            _preload_state.llm_model.status = "error"
            _preload_state.llm_model.error = str(e)


def preload_models_async():
    """异步预加载所有模型"""
    global _preload_state

    with _preload_lock:
        _preload_state.started_at = datetime.now()

    print("[Preload] Starting model preload...")

    # 并行加载 OCR 和 LLM 模型
    ocr_thread = threading.Thread(target=_preload_ocr_model, daemon=True)
    llm_thread = threading.Thread(target=_preload_llm_model, daemon=True)

    ocr_thread.start()
    llm_thread.start()

    # 启动监控线程
    def monitor():
        ocr_thread.join()
        llm_thread.join()
        with _preload_lock:
            _preload_state.completed_at = datetime.now()

        if _preload_state.is_ready:
            print("[Preload] All models loaded successfully!")
        else:
            print("[Preload] Some models failed to load")

    monitor_thread = threading.Thread(target=monitor, daemon=True)
    monitor_thread.start()


def preload_models_sync():
    """同步预加载所有模型 (阻塞直到完成)"""
    global _preload_state

    with _preload_lock:
        _preload_state.started_at = datetime.now()

    print("[Preload] Starting synchronous model preload...")

    # 先加载 OCR，再加载 LLM
    _preload_ocr_model()
    _preload_llm_model()

    with _preload_lock:
        _preload_state.completed_at = datetime.now()

    if _preload_state.is_ready:
        print("[Preload] All models loaded successfully!")
    else:
        print("[Preload] Some models failed to load")
