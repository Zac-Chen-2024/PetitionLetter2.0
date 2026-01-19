"""
DeepSeek-OCR 本地模型服务

使用 DeepSeek-OCR 3B 模型进行本地 OCR 识别
- 输出 BBox 坐标数据（用于 UI 高亮回溯）
- 输出 Markdown 结构化文本（用于 LLM 分析）
- 批量 GPU 处理模式：一次加载模型，处理所有页面

参考: https://github.com/deepseek-ai/DeepSeek-OCR
"""

import os
import re
import json
import tempfile
import subprocess
import platform
from typing import List, Dict, Any, Tuple, Optional, Callable
from pathlib import Path

from app.core.config import settings

# DeepSeek-OCR 配置 - 从 settings 读取
DEEPSEEK_OCR_VENV = settings.deepseek_ocr_venv
DEEPSEEK_OCR_MODEL = settings.deepseek_ocr_model

# 根据操作系统选择 Python 路径
if platform.system() == "Windows":
    DEEPSEEK_OCR_PYTHON = os.path.join(DEEPSEEK_OCR_VENV, "Scripts", "python.exe")
else:
    DEEPSEEK_OCR_PYTHON = os.path.join(DEEPSEEK_OCR_VENV, "bin", "python")

# OCR 参数配置 (Gundam 模式，适合文档)
DEFAULT_BASE_SIZE = 1024
DEFAULT_IMAGE_SIZE = 640
DEFAULT_CROP_MODE = True


def is_available() -> bool:
    """检查 DeepSeek-OCR 环境是否可用"""
    return os.path.exists(DEEPSEEK_OCR_PYTHON)


def get_type_cn(element_type: str) -> str:
    """元素类型中文映射"""
    mapping = {
        'title': '标题',
        'text': '文本',
        'table': '表格',
        'image': '图片',
        'table_caption': '表格标题',
        'figure_caption': '图片标题',
        'header': '页眉',
        'footer': '页脚',
        'formula': '公式'
    }
    return mapping.get(element_type, element_type)


def parse_grounding_output(text: str, page_number: int = 1) -> List[Dict[str, Any]]:
    """
    解析带 grounding 标记的 OCR 输出
    格式: <|ref|>type<|/ref|><|det|>[[x1, y1, x2, y2]]<|/det|> content

    Args:
        text: OCR 原始输出文本
        page_number: 页码（用于生成 block_id）

    Returns:
        解析后的文本块列表
    """
    results = []

    # 匹配模式: <|ref|>type<|/ref|><|det|>[[x1, y1, x2, y2]]<|/det|>
    pattern = r'<\|ref\|>([^<]+)<\|/ref\|><\|det\|>\[\[([^\]]+)\]\]<\|/det\|>'

    matches = list(re.finditer(pattern, text))

    for i, match in enumerate(matches):
        element_type = match.group(1)
        bbox_str = match.group(2)

        # 解析 bbox 坐标
        try:
            bbox_values = [int(x.strip()) for x in bbox_str.split(',')]
        except ValueError:
            continue

        # 获取内容（从当前匹配结束到下一个匹配开始）
        start_pos = match.end()
        if i + 1 < len(matches):
            end_pos = matches[i + 1].start()
        else:
            end_pos = len(text)

        content = text[start_pos:end_pos].strip()
        # 清理多余空格和换行
        content = ' '.join(content.split())

        block_id = f"p{page_number}_b{i}"

        results.append({
            'block_id': block_id,
            'page_number': page_number,
            'block_type': element_type,
            'block_type_cn': get_type_cn(element_type),
            'text_content': content,
            'bbox': {
                'x1': bbox_values[0],
                'y1': bbox_values[1],
                'x2': bbox_values[2],
                'y2': bbox_values[3]
            },
            'bbox_list': bbox_values
        })

    return results


def extract_markdown_from_grounding(text: str) -> str:
    """
    从 grounding 输出中提取纯 Markdown 文本
    去除所有 <|ref|> 和 <|det|> 标记
    """
    # 移除 grounding 标记
    pattern = r'<\|ref\|>[^<]+<\|/ref\|><\|det\|>\[\[[^\]]+\]\]<\|/det\|>'
    clean_text = re.sub(pattern, '', text)

    # 清理多余空行
    lines = clean_text.split('\n')
    clean_lines = [line for line in lines if line.strip()]

    return '\n\n'.join(clean_lines)


def call_deepseek_ocr_batch_gpu(
    image_paths: List[str],
    progress_callback: Callable[[int, int, str], None] = None
) -> List[str]:
    """
    批量 GPU 处理：一次加载模型，处理所有图片

    Args:
        image_paths: 图片文件路径列表
        progress_callback: 进度回调 (current, total, status_message)

    Returns:
        每个图片的 OCR 原始输出列表
    """
    if not is_available():
        raise RuntimeError(f"DeepSeek-OCR 环境不可用: {DEEPSEEK_OCR_PYTHON}")

    if not image_paths:
        return []

    # 验证所有文件存在
    for path in image_paths:
        if not os.path.exists(path):
            raise FileNotFoundError(f"图片文件不存在: {path}")

    # 创建临时目录存放结果
    with tempfile.TemporaryDirectory() as temp_dir:
        # 创建图片列表文件
        image_list_file = os.path.join(temp_dir, "image_list.json")
        with open(image_list_file, 'w', encoding='utf-8') as f:
            json.dump(image_paths, f)

        results_file = os.path.join(temp_dir, "results.json")
        progress_file = os.path.join(temp_dir, "progress.txt")

        # 批量处理脚本 - 一次加载模型，处理所有图片
        script = f'''
import os
import sys
import json
import io
from contextlib import redirect_stdout

# 强制使用 GPU
os.environ["CUDA_VISIBLE_DEVICES"] = "0"

import torch
if not torch.cuda.is_available():
    print("ERROR: CUDA not available!", file=sys.stderr)
    sys.exit(1)

from transformers import AutoModel, AutoTokenizer

model_name = "{DEEPSEEK_OCR_MODEL}"
image_list_file = r"{image_list_file}"
results_file = r"{results_file}"
progress_file = r"{progress_file}"

# 读取图片列表
with open(image_list_file, 'r') as f:
    image_paths = json.load(f)

total = len(image_paths)
print(f"[GPU-OCR] Loading model to GPU...", flush=True)

# 一次性加载模型到 GPU
tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
model = AutoModel.from_pretrained(
    model_name,
    trust_remote_code=True,
    use_safetensors=True,
    torch_dtype=torch.bfloat16,
    device_map="cuda:0"
)
model = model.eval()

print(f"[GPU-OCR] Model loaded. GPU memory: {{torch.cuda.memory_allocated()/1024**3:.2f}} GB", flush=True)

# 使用 grounding prompt 获取 bbox
prompt = "<image>\\n<|grounding|>Convert the document to markdown. "

results = []

for idx, image_file in enumerate(image_paths):
    page_num = idx + 1

    # 写入进度文件
    with open(progress_file, 'w') as pf:
        pf.write(f"{{page_num}}/{{total}}")

    print(f"[GPU-OCR] Processing page {{page_num}}/{{total}}: {{os.path.basename(image_file)}}", flush=True)

    try:
        # 捕获输出
        captured = io.StringIO()
        with redirect_stdout(captured):
            res = model.infer(
                tokenizer,
                prompt=prompt,
                image_file=image_file,
                output_path=r"{temp_dir}",
                base_size={DEFAULT_BASE_SIZE},
                image_size={DEFAULT_IMAGE_SIZE},
                crop_mode={DEFAULT_CROP_MODE},
                save_results=False
            )

        raw_output = captured.getvalue()
        results.append({{"page": page_num, "output": raw_output, "error": None}})
        print(f"[GPU-OCR] Page {{page_num}} completed", flush=True)

    except Exception as e:
        print(f"[GPU-OCR] Page {{page_num}} error: {{e}}", flush=True)
        results.append({{"page": page_num, "output": "", "error": str(e)}})

# 保存结果
with open(results_file, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False)

print(f"[GPU-OCR] All {{total}} pages completed", flush=True)
'''

        # 写入脚本文件
        script_file = os.path.join(temp_dir, "batch_ocr.py")
        with open(script_file, 'w', encoding='utf-8') as f:
            f.write(script)

        # 执行批量 OCR
        print(f"[DeepSeek-OCR] Starting batch GPU processing for {len(image_paths)} images...")

        process = subprocess.Popen(
            [DEEPSEEK_OCR_PYTHON, script_file],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace'
        )

        # 实时读取输出并回调进度
        last_progress = 0
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                print(line.strip())
                # 解析进度
                if "[GPU-OCR] Processing page" in line:
                    try:
                        parts = line.split("page")[1].split("/")
                        current = int(parts[0].strip())
                        if progress_callback and current != last_progress:
                            progress_callback(current, len(image_paths), f"OCR page {current}/{len(image_paths)}")
                            last_progress = current
                    except:
                        pass

        process.wait()

        if process.returncode != 0:
            raise RuntimeError(f"批量 OCR 执行失败，返回码: {process.returncode}")

        # 读取结果
        if not os.path.exists(results_file):
            raise RuntimeError("OCR 结果文件未生成")

        with open(results_file, 'r', encoding='utf-8') as f:
            results = json.load(f)

        # 提取输出列表
        outputs = []
        for r in results:
            if r.get("error"):
                outputs.append(f"[OCR Error: {r['error']}]")
            else:
                outputs.append(r.get("output", ""))

        return outputs


def process_single_image(
    image_path: str,
    page_number: int = 1
) -> Dict[str, Any]:
    """
    处理单张图片，返回 BBox 数据和 Markdown 文本
    使用批量 GPU 模式（即使只有一张图片）
    """
    outputs = call_deepseek_ocr_batch_gpu([image_path])
    raw_output = outputs[0] if outputs else ""

    # 解析 grounding 输出获取 bbox
    text_blocks = parse_grounding_output(raw_output, page_number)

    # 提取纯 Markdown 文本
    markdown_text = extract_markdown_from_grounding(raw_output)

    return {
        "page_number": page_number,
        "markdown_text": markdown_text,
        "text_blocks": text_blocks,
        "raw_output": raw_output
    }


def process_image_bytes(
    image_bytes: bytes,
    page_number: int = 1
) -> Dict[str, Any]:
    """
    处理图片字节数据
    """
    # 保存为临时文件
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(image_bytes)
        temp_path = f.name

    try:
        result = process_single_image(temp_path, page_number)
        return result
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def process_pdf(
    pdf_bytes: bytes,
    max_pages: int = 50,
    dpi: int = 200,
    progress_callback: Callable[[int, int], None] = None,
    page_callback: Callable[[int, Dict], None] = None,
    skip_pages: List[int] = None,
    should_stop_callback: Callable[[], Optional[str]] = None
) -> Dict[str, Any]:
    """
    处理 PDF 文件 - 批量 GPU 模式
    一次加载模型，处理所有页面，大幅提升速度

    Args:
        pdf_bytes: PDF 文件字节数据
        max_pages: 最大处理页数
        dpi: 图片 DPI
        progress_callback: 进度回调函数 (current_page, total_pages)
        page_callback: 单页完成回调函数 (page_number, page_result)
        skip_pages: 跳过的页码列表（已完成的页），页码从1开始
        should_stop_callback: 检查是否应停止的回调

    Returns:
        处理结果字典
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError("需要安装 PyMuPDF: pip install pymupdf")

    skip_pages = skip_pages or []

    # 打开 PDF
    pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
    num_pages = min(pdf_document.page_count, max_pages)

    # 检查是否需要停止
    if should_stop_callback:
        stop_signal = should_stop_callback()
        if stop_signal:
            pdf_document.close()
            return {
                "total_pages": num_pages,
                "markdown_text": "",
                "text_blocks": [],
                "pages": [],
                "stopped": stop_signal,
                "stopped_at_page": 1
            }

    # 第一步：将所有需要处理的页面转换为图片
    print(f"[DeepSeek-OCR] Converting {num_pages} PDF pages to images...")

    temp_dir = tempfile.mkdtemp()
    image_paths = []
    page_numbers = []

    try:
        for page_num in range(num_pages):
            page_number = page_num + 1

            # 跳过已完成的页
            if page_number in skip_pages:
                continue

            page = pdf_document[page_num]

            # 转换为图片
            zoom = dpi / 72
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)

            # 保存临时图片
            img_path = os.path.join(temp_dir, f"page_{page_number:04d}.jpg")
            pix.save(img_path)

            image_paths.append(img_path)
            page_numbers.append(page_number)

        pdf_document.close()

        if not image_paths:
            return {
                "total_pages": num_pages,
                "markdown_text": "",
                "text_blocks": [],
                "pages": [],
                "stopped": None,
                "stopped_at_page": None
            }

        # 第二步：批量 GPU OCR 处理
        def batch_progress(current, total, msg):
            if progress_callback:
                progress_callback(page_numbers[current-1] if current <= len(page_numbers) else current, num_pages)

        outputs = call_deepseek_ocr_batch_gpu(image_paths, batch_progress)

        # 第三步：解析结果
        all_text_blocks = []
        all_markdown_parts = []
        pages_results = []

        for idx, (page_number, raw_output) in enumerate(zip(page_numbers, outputs)):
            # 解析 grounding 输出
            text_blocks = parse_grounding_output(raw_output, page_number)
            markdown_text = extract_markdown_from_grounding(raw_output)

            page_result = {
                "page_number": page_number,
                "markdown_text": markdown_text,
                "text_blocks": text_blocks,
                "raw_output": raw_output
            }

            # 回调保存
            if page_callback:
                page_callback(page_number, page_result)

            all_text_blocks.extend(text_blocks)
            all_markdown_parts.append(f"--- Page {page_number} ---\n{markdown_text}")
            pages_results.append(page_result)

        # 合并结果
        combined_markdown = "\n\n".join(all_markdown_parts)

        return {
            "total_pages": num_pages,
            "markdown_text": combined_markdown,
            "text_blocks": all_text_blocks,
            "pages": pages_results,
            "stopped": None,
            "stopped_at_page": None
        }

    finally:
        # 清理临时文件
        import shutil
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


async def process_pdf_async(
    pdf_bytes: bytes,
    max_pages: int = 50,
    dpi: int = 200
) -> Dict[str, Any]:
    """
    异步版本的 PDF OCR 处理
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    loop = asyncio.get_event_loop()

    with ThreadPoolExecutor(max_workers=1) as executor:
        result = await loop.run_in_executor(
            executor,
            lambda: process_pdf(pdf_bytes, max_pages, dpi)
        )

    return result


async def process_image_async(
    image_bytes: bytes,
    page_number: int = 1
) -> Dict[str, Any]:
    """
    异步版本的图片 OCR 处理
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    loop = asyncio.get_event_loop()

    with ThreadPoolExecutor(max_workers=1) as executor:
        result = await loop.run_in_executor(
            executor,
            lambda: process_image_bytes(image_bytes, page_number)
        )

    return result


# ============== 测试函数 ==============

def test_ocr():
    """测试 OCR 功能"""
    print("=" * 60)
    print("DeepSeek-OCR 批量 GPU 模式测试")
    print("=" * 60)

    # 检查环境
    print(f"\n环境检查:")
    print(f"  Python: {DEEPSEEK_OCR_PYTHON}")
    print(f"  可用: {is_available()}")

    if not is_available():
        print("DeepSeek-OCR 环境不可用!")
        return

    # 检查 GPU
    try:
        result = subprocess.run(
            [DEEPSEEK_OCR_PYTHON, "-c", "import torch; print('CUDA:', torch.cuda.is_available())"],
            capture_output=True,
            text=True
        )
        print(f"  GPU: {result.stdout.strip()}")
    except Exception as e:
        print(f"  GPU 检查失败: {e}")


if __name__ == '__main__':
    test_ocr()
