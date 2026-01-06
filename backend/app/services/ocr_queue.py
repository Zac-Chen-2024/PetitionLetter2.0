"""
OCR 任务队列管理器

实现串行 OCR 处理，避免多个 OCR 任务同时运行导致内存溢出。
每次只处理一个文档，完成后再处理下一个。
"""

import asyncio
import threading
import queue
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class QueueTaskStatus(str, Enum):
    """队列任务状态"""
    QUEUED = "queued"           # 等待处理
    PROCESSING = "processing"   # 正在处理
    PAUSED = "paused"          # 暂停
    COMPLETED = "completed"     # 处理完成
    FAILED = "failed"          # 处理失败
    CANCELLED = "cancelled"    # 取消


class OCRCancelledException(Exception):
    """OCR 被取消异常"""
    pass


class OCRPausedException(Exception):
    """OCR 被暂停异常"""
    pass


@dataclass
class OCRTask:
    """OCR 任务"""
    document_id: str
    project_id: str
    file_name: str
    file_type: str
    file_bytes: bytes
    batch_id: Optional[str] = None
    status: QueueTaskStatus = QueueTaskStatus.QUEUED
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    # 控制信号
    cancel_requested: bool = False
    pause_requested: bool = False

    # 页级别进度
    total_pages: int = 0           # PDF 总页数
    current_page: int = 0          # 当前处理到第几页
    completed_pages: List[int] = field(default_factory=list)  # 已完成的页码
    page_status: str = ""          # "Processing page 5/27"

    # 页级别时间记录
    page_timings: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    # 格式: {1: {"started_at": "...", "completed_at": "...", "duration": 25.3}, ...}


class OCRQueueManager:
    """OCR 队列管理器 - 单例模式"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True
        self._queue: queue.Queue[OCRTask] = queue.Queue()
        self._current_task: Optional[OCRTask] = None
        self._tasks: Dict[str, OCRTask] = {}  # document_id -> task
        self._batch_tasks: Dict[str, List[str]] = {}  # batch_id -> [document_ids]
        self._worker_thread: Optional[threading.Thread] = None
        self._running = False
        self._processor_callback = None

        print("[OCR-Queue] Queue manager initialized")

    def set_processor(self, callback):
        """设置 OCR 处理回调函数

        callback 签名: (document_id, file_bytes, file_name, file_type, batch_id) -> bool
        返回 True 表示成功，False 表示失败
        """
        self._processor_callback = callback

    def add_task(
        self,
        document_id: str,
        project_id: str,
        file_name: str,
        file_type: str,
        file_bytes: bytes,
        batch_id: Optional[str] = None
    ) -> int:
        """添加 OCR 任务到队列

        Returns:
            队列位置（从 1 开始）
        """
        # 检查是否已经在队列中
        if document_id in self._tasks:
            existing = self._tasks[document_id]
            if existing.status in [QueueTaskStatus.QUEUED, QueueTaskStatus.PROCESSING]:
                # 已经在处理中，返回当前位置
                return self.get_position(document_id)

        task = OCRTask(
            document_id=document_id,
            project_id=project_id,
            file_name=file_name,
            file_type=file_type,
            file_bytes=file_bytes,
            batch_id=batch_id
        )

        self._tasks[document_id] = task
        self._queue.put(task)

        # 记录批次
        if batch_id:
            if batch_id not in self._batch_tasks:
                self._batch_tasks[batch_id] = []
            self._batch_tasks[batch_id].append(document_id)

        position = self._queue.qsize()
        print(f"[OCR-Queue] Added task: {file_name} (doc: {document_id[:8]}...) at position {position}")

        # 确保 worker 在运行
        self._ensure_worker_running()

        return position

    def get_position(self, document_id: str) -> int:
        """获取任务在队列中的位置

        Returns:
            位置（1 开始），0 表示正在处理，-1 表示不在队列中
        """
        if document_id not in self._tasks:
            return -1

        task = self._tasks[document_id]

        if task.status == QueueTaskStatus.PROCESSING:
            return 0

        if task.status in [QueueTaskStatus.COMPLETED, QueueTaskStatus.FAILED]:
            return -1

        # 计算队列位置
        position = 1
        for t in list(self._queue.queue):
            if t.document_id == document_id:
                return position
            if t.status == QueueTaskStatus.QUEUED:
                position += 1

        return position

    def get_task_status(self, document_id: str) -> Optional[Dict[str, Any]]:
        """获取任务状态"""
        if document_id not in self._tasks:
            return None

        task = self._tasks[document_id]
        return {
            "document_id": task.document_id,
            "file_name": task.file_name,
            "status": task.status.value,
            "position": self.get_position(document_id),
            "error": task.error,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "finished_at": task.finished_at.isoformat() if task.finished_at else None,
        }

    def get_batch_status(self, batch_id: str) -> Optional[Dict[str, Any]]:
        """获取批次状态"""
        if batch_id not in self._batch_tasks:
            return None

        doc_ids = self._batch_tasks[batch_id]
        tasks = [self._tasks[doc_id] for doc_id in doc_ids if doc_id in self._tasks]

        total = len(tasks)
        queued = sum(1 for t in tasks if t.status == QueueTaskStatus.QUEUED)
        processing = sum(1 for t in tasks if t.status == QueueTaskStatus.PROCESSING)
        completed = sum(1 for t in tasks if t.status == QueueTaskStatus.COMPLETED)
        failed = sum(1 for t in tasks if t.status == QueueTaskStatus.FAILED)

        # 找到当前正在处理的任务
        current = None
        for t in tasks:
            if t.status == QueueTaskStatus.PROCESSING:
                current = t.file_name
                break

        return {
            "batch_id": batch_id,
            "total": total,
            "queued": queued,
            "processing": processing,
            "completed": completed,
            "failed": failed,
            "progress_percent": round((completed + failed) / total * 100, 1) if total > 0 else 0,
            "is_finished": (completed + failed) >= total,
            "current_file": current,
            "documents": {
                doc_id: self.get_task_status(doc_id)
                for doc_id in doc_ids
            }
        }

    def get_queue_status(self) -> Dict[str, Any]:
        """获取整体队列状态"""
        pending_count = self._queue.qsize()
        current = None

        if self._current_task:
            current = {
                "document_id": self._current_task.document_id,
                "file_name": self._current_task.file_name,
                "started_at": self._current_task.started_at.isoformat() if self._current_task.started_at else None,
                # 页级别进度
                "total_pages": self._current_task.total_pages,
                "current_page": self._current_task.current_page,
                "page_status": self._current_task.page_status
            }

        return {
            "running": self._running,
            "pending_count": pending_count,
            "current_task": current,
            "total_tasks_tracked": len(self._tasks)
        }

    def _ensure_worker_running(self):
        """确保 worker 线程在运行"""
        if self._running and self._worker_thread and self._worker_thread.is_alive():
            return

        self._running = True
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()
        print("[OCR-Queue] Worker thread started")

    def _worker_loop(self):
        """Worker 线程主循环 - 串行处理 OCR 任务"""
        print("[OCR-Queue] Worker loop started")

        while self._running:
            try:
                # 阻塞等待任务，超时 5 秒检查一次
                try:
                    task = self._queue.get(timeout=5)
                except queue.Empty:
                    # 没有任务时检查是否需要继续运行
                    if self._queue.empty():
                        # 队列为空，可以考虑停止 worker
                        # 但为了简单起见，我们继续等待
                        pass
                    continue

                # 开始处理任务
                self._current_task = task
                task.status = QueueTaskStatus.PROCESSING
                task.started_at = datetime.utcnow()

                print(f"[OCR-Queue] Processing: {task.file_name} (doc: {task.document_id[:8]}...)")

                if self._processor_callback:
                    try:
                        success = self._processor_callback(
                            task.document_id,
                            task.file_bytes,
                            task.file_name,
                            task.file_type,
                            task.batch_id
                        )

                        if success:
                            task.status = QueueTaskStatus.COMPLETED
                            print(f"[OCR-Queue] Completed: {task.file_name}")
                        else:
                            task.status = QueueTaskStatus.FAILED
                            task.error = "Processing returned false"
                            print(f"[OCR-Queue] Failed: {task.file_name}")

                    except Exception as e:
                        task.status = QueueTaskStatus.FAILED
                        task.error = str(e)
                        print(f"[OCR-Queue] Error processing {task.file_name}: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    task.status = QueueTaskStatus.FAILED
                    task.error = "No processor callback set"
                    print("[OCR-Queue] Error: No processor callback set!")

                task.finished_at = datetime.utcnow()
                self._current_task = None

                # 释放文件内存
                task.file_bytes = b''

                # 标记任务完成
                self._queue.task_done()

            except Exception as e:
                print(f"[OCR-Queue] Worker loop error: {e}")
                import traceback
                traceback.print_exc()

        print("[OCR-Queue] Worker loop stopped")

    def request_cancel(self, document_id: str) -> bool:
        """请求取消任务

        Returns:
            True 如果成功发送取消请求，False 如果任务不存在或无法取消
        """
        if document_id not in self._tasks:
            return False

        task = self._tasks[document_id]

        # 只能取消 QUEUED 或 PROCESSING 状态的任务
        if task.status == QueueTaskStatus.QUEUED:
            # 还在队列中，直接标记为取消
            task.status = QueueTaskStatus.CANCELLED
            task.cancel_requested = True
            task.finished_at = datetime.utcnow()
            print(f"[OCR-Queue] Cancelled queued task: {task.file_name}")
            return True
        elif task.status == QueueTaskStatus.PROCESSING:
            # 正在处理，设置取消标志让处理器检查
            task.cancel_requested = True
            print(f"[OCR-Queue] Cancel requested for processing task: {task.file_name}")
            return True
        elif task.status == QueueTaskStatus.PAUSED:
            # 暂停中的也可以取消
            task.status = QueueTaskStatus.CANCELLED
            task.cancel_requested = True
            task.finished_at = datetime.utcnow()
            print(f"[OCR-Queue] Cancelled paused task: {task.file_name}")
            return True

        return False

    def request_pause(self, document_id: str) -> bool:
        """请求暂停任务

        Returns:
            True 如果成功发送暂停请求，False 如果任务不存在或无法暂停
        """
        if document_id not in self._tasks:
            return False

        task = self._tasks[document_id]

        # 只能暂停 PROCESSING 状态的任务
        if task.status == QueueTaskStatus.PROCESSING:
            task.pause_requested = True
            print(f"[OCR-Queue] Pause requested for: {task.file_name}")
            return True

        return False

    def request_resume(self, document_id: str) -> bool:
        """请求恢复暂停的任务

        Returns:
            True 如果成功恢复，False 如果任务不存在或不是暂停状态
        """
        if document_id not in self._tasks:
            return False

        task = self._tasks[document_id]

        if task.status == QueueTaskStatus.PAUSED:
            # 重置控制信号
            task.pause_requested = False
            task.cancel_requested = False
            # 重新加入队列
            task.status = QueueTaskStatus.QUEUED
            self._queue.put(task)
            print(f"[OCR-Queue] Resumed task: {task.file_name}, will continue from page {task.current_page + 1}")
            self._ensure_worker_running()
            return True

        return False

    def check_should_stop(self, document_id: str) -> Optional[str]:
        """检查任务是否应该停止处理

        由 OCR 处理器在每页处理前调用

        Returns:
            None 如果应该继续
            "cancel" 如果应该取消
            "pause" 如果应该暂停
        """
        if document_id not in self._tasks:
            return None

        task = self._tasks[document_id]

        if task.cancel_requested:
            return "cancel"
        if task.pause_requested:
            return "pause"

        return None

    def update_page_progress(
        self,
        document_id: str,
        current_page: int,
        total_pages: int,
        page_status: str = ""
    ):
        """更新页级别进度

        由 OCR 处理器在每页处理时调用
        """
        if document_id not in self._tasks:
            return

        task = self._tasks[document_id]
        task.current_page = current_page
        task.total_pages = total_pages
        task.page_status = page_status or f"Processing page {current_page}/{total_pages}"

    def record_page_timing(
        self,
        document_id: str,
        page_number: int,
        started_at: datetime,
        completed_at: datetime
    ):
        """记录单页处理时间

        由 OCR 处理器在每页完成时调用
        """
        if document_id not in self._tasks:
            return

        task = self._tasks[document_id]
        duration = (completed_at - started_at).total_seconds()

        task.page_timings[page_number] = {
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration": round(duration, 2)
        }

        if page_number not in task.completed_pages:
            task.completed_pages.append(page_number)

        print(f"[OCR-Queue] Page {page_number} completed in {duration:.2f}s")

    def mark_task_paused(self, document_id: str):
        """标记任务为暂停状态（由处理器调用）"""
        if document_id not in self._tasks:
            return

        task = self._tasks[document_id]
        task.status = QueueTaskStatus.PAUSED
        print(f"[OCR-Queue] Task paused: {task.file_name} at page {task.current_page}/{task.total_pages}")

    def mark_task_cancelled(self, document_id: str):
        """标记任务为取消状态（由处理器调用）"""
        if document_id not in self._tasks:
            return

        task = self._tasks[document_id]
        task.status = QueueTaskStatus.CANCELLED
        task.finished_at = datetime.utcnow()
        print(f"[OCR-Queue] Task cancelled: {task.file_name}")

    def get_task(self, document_id: str) -> Optional[OCRTask]:
        """获取任务对象"""
        return self._tasks.get(document_id)

    def stop(self):
        """停止队列处理"""
        self._running = False
        print("[OCR-Queue] Stopping...")

    def clear(self):
        """清空队列（不影响正在处理的任务）"""
        while not self._queue.empty():
            try:
                task = self._queue.get_nowait()
                task.status = QueueTaskStatus.FAILED
                task.error = "Queue cleared"
                self._queue.task_done()
            except queue.Empty:
                break
        print("[OCR-Queue] Queue cleared")


# 全局队列管理器实例
ocr_queue = OCRQueueManager()
