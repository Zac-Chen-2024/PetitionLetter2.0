"""
DeepSeek-OCR 本地模型服务

使用 DeepSeek-OCR 3B 模型进行本地 OCR 识别
- 输出 BBox 坐标数据（用于 UI 高亮回溯）
- 输出 Markdown 结构化文本（用于 LLM 分析）

参考: https://github.com/deepseek-ai/DeepSeek-OCR
"""

import os
import re
import sys
import json
import tempfile
import subprocess
from typing import List, Dict, Any, Tuple, Optional, Callable
from pathlib import Path

from app.core.config import settings

# DeepSeek-OCR 虚拟环境配置 (从 config 读取)
DEEPSEEK_OCR_VENV = settings.deepseek_ocr_venv
DEEPSEEK_OCR_MODEL = settings.deepseek_ocr_model


def get_python_executable() -> str:
    """跨平台获取 Python 可执行文件路径"""
    if sys.platform == "win32":
        return os.path.join(DEEPSEEK_OCR_VENV, "Scripts", "python.exe")
    else:
        # Linux/macOS: 检查 conda 环境或 venv
        conda_python = os.path.join(DEEPSEEK_OCR_VENV, "bin", "python")
        venv_python = os.path.join(DEEPSEEK_OCR_VENV, "bin", "python3")
        if os.path.exists(conda_python):
            return conda_python
        elif os.path.exists(venv_python):
            return venv_python
        else:
            return conda_python  # 默认返回 conda 路径


DEEPSEEK_OCR_PYTHON = get_python_executable()

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


def call_deepseek_ocr_subprocess(image_path: str) -> Tuple[str, List[Dict]]:
    """
    通过子进程调用 DeepSeek-OCR

    Args:
        image_path: 图片文件路径

    Returns:
        (raw_output, bbox_results) 元组
    """
    if not is_available():
        raise RuntimeError(f"DeepSeek-OCR 环境不可用: {DEEPSEEK_OCR_PYTHON}")

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"图片文件不存在: {image_path}")

    # 创建临时输出目录
    with tempfile.TemporaryDirectory() as temp_dir:
        # Python 脚本内容 - 使用与 test_deepseek_ocr.py 一致的加载方式
        script = f'''
import os
import sys
import io
from contextlib import redirect_stdout

os.environ["CUDA_VISIBLE_DEVICES"] = "0"

from transformers import AutoModel, AutoTokenizer
import torch

model_name = "{DEEPSEEK_OCR_MODEL}"
image_file = r"{image_path}"
output_path = r"{temp_dir}"

# 加载模型 - 先加载到 CPU，再移到 GPU
tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
model = AutoModel.from_pretrained(
    model_name,
    trust_remote_code=True,
    use_safetensors=True,
)
model = model.eval().cuda().to(torch.bfloat16)

# 使用 grounding prompt 获取 bbox
prompt = "<image>\\n<|grounding|>Convert the document to markdown. "

# 捕获输出
captured = io.StringIO()
with redirect_stdout(captured):
    res = model.infer(
        tokenizer,
        prompt=prompt,
        image_file=image_file,
        output_path=output_path,
        base_size={DEFAULT_BASE_SIZE},
        image_size={DEFAULT_IMAGE_SIZE},
        crop_mode={DEFAULT_CROP_MODE},
        save_results=False
    )

raw_output = captured.getvalue()

# 输出标记
print("===DEEPSEEK_OCR_OUTPUT_START===")
print(raw_output)
print("===DEEPSEEK_OCR_OUTPUT_END===")
'''

        # 写入临时脚本文件 (避免中文路径编码问题)
        script_file = os.path.join(temp_dir, "ocr_script.py")
        with open(script_file, 'w', encoding='utf-8') as f:
            f.write(script)

        # 执行子进程
        result = subprocess.run(
            [DEEPSEEK_OCR_PYTHON, script_file],
            capture_output=True,
            text=True,
            timeout=600,  # 10 分钟超时 (首次加载模型需要较长时间)
            encoding='utf-8',
            errors='replace'
        )

        if result.returncode != 0:
            error_msg = result.stderr or result.stdout
            raise RuntimeError(f"DeepSeek-OCR 执行失败: {error_msg}")

        # 提取输出
        output = result.stdout
        start_marker = "===DEEPSEEK_OCR_OUTPUT_START==="
        end_marker = "===DEEPSEEK_OCR_OUTPUT_END==="

        start_idx = output.find(start_marker)
        end_idx = output.find(end_marker)

        if start_idx == -1 or end_idx == -1:
            raise RuntimeError(f"无法解析 OCR 输出: {output[:500]}")

        raw_output = output[start_idx + len(start_marker):end_idx].strip()

        return raw_output


def process_single_image(
    image_path: str,
    page_number: int = 1
) -> Dict[str, Any]:
    """
    处理单张图片，返回 BBox 数据和 Markdown 文本

    Args:
        image_path: 图片文件路径
        page_number: 页码

    Returns:
        {
            "page_number": 1,
            "markdown_text": "...",
            "text_blocks": [...]
        }
    """
    raw_output = call_deepseek_ocr_subprocess(image_path)

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

    Args:
        image_bytes: 图片字节数据
        page_number: 页码

    Returns:
        处理结果字典
    """
    # 保存为临时文件
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(image_bytes)
        temp_path = f.name

    try:
        result = process_single_image(temp_path, page_number)
        return result
    finally:
        # 清理临时文件
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
    处理 PDF 文件，逐页 OCR 并合并结果

    Args:
        pdf_bytes: PDF 文件字节数据
        max_pages: 最大处理页数
        dpi: 图片 DPI
        progress_callback: 进度回调函数 (current_page, total_pages)，每页开始处理时调用
        page_callback: 单页完成回调函数 (page_number, page_result)，用于即时保存
        skip_pages: 跳过的页码列表（已完成的页），页码从1开始
        should_stop_callback: 检查是否应停止的回调，返回 None 继续，"cancel" 取消，"pause" 暂停

    Returns:
        {
            "total_pages": 10,
            "markdown_text": "完整 Markdown 文本",
            "text_blocks": [所有页面的文本块],
            "pages": [每页的详细结果],
            "stopped": None | "cancel" | "pause",
            "stopped_at_page": 页码（如果被中断）
        }
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError("需要安装 PyMuPDF: pip install pymupdf")

    skip_pages = skip_pages or []

    # 打开 PDF
    pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
    num_pages = min(pdf_document.page_count, max_pages)

    all_text_blocks = []
    all_markdown_parts = []
    pages_results = []
    stopped = None
    stopped_at_page = None

    for page_num in range(num_pages):
        page_number = page_num + 1  # 页码从1开始

        # 检查是否应该停止（在每页开始前检查）
        if should_stop_callback:
            stop_signal = should_stop_callback()
            if stop_signal:
                stopped = stop_signal
                stopped_at_page = page_number
                print(f"[DeepSeek-OCR] Stopping at page {page_number}: {stop_signal}")
                break

        # 通知进度（即使跳过也通知）
        if progress_callback:
            progress_callback(page_number, num_pages)

        # 跳过已完成的页
        if page_number in skip_pages:
            continue

        page = pdf_document[page_num]

        # 转换为图片
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("jpeg", jpg_quality=90)

        # OCR 处理
        try:
            page_result = process_image_bytes(img_bytes, page_number)

            # 即时回调保存
            if page_callback:
                page_callback(page_number, page_result)

            all_text_blocks.extend(page_result["text_blocks"])
            all_markdown_parts.append(f"--- Page {page_number} ---\n{page_result['markdown_text']}")
            pages_results.append(page_result)

        except Exception as e:
            # 记录错误但继续处理其他页面
            error_result = {
                "page_number": page_number,
                "markdown_text": f"[OCR Error: {str(e)}]",
                "text_blocks": [],
                "error": str(e)
            }
            all_markdown_parts.append(f"--- Page {page_number} ---\n[OCR Error: {str(e)}]")
            pages_results.append(error_result)

    pdf_document.close()

    # 合并结果
    combined_markdown = "\n\n".join(all_markdown_parts)

    return {
        "total_pages": num_pages,
        "markdown_text": combined_markdown,
        "text_blocks": all_text_blocks,
        "pages": pages_results,
        "stopped": stopped,
        "stopped_at_page": stopped_at_page
    }


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

def test_ocr(test_image: str = None):
    """测试 OCR 功能

    Args:
        test_image: 测试图片路径，如果不指定则只检查环境
    """
    print("=" * 60)
    print("DeepSeek-OCR 测试")
    print("=" * 60)

    # 检查环境
    print(f"\n环境检查:")
    print(f"  VENV: {DEEPSEEK_OCR_VENV}")
    print(f"  Python: {DEEPSEEK_OCR_PYTHON}")
    print(f"  可用: {is_available()}")

    if not is_available():
        print("DeepSeek-OCR 环境不可用!")
        print(f"请检查路径是否正确: {DEEPSEEK_OCR_PYTHON}")
        return

    if test_image is None:
        print("\n未指定测试图片，跳过 OCR 测试")
        print("用法: python -m app.services.deepseek_ocr /path/to/image.jpg")
        return

    if os.path.exists(test_image):
        print(f"\n测试图片: {test_image}")
        try:
            result = process_single_image(test_image)
            print(f"\n识别结果:")
            print(f"  文本块数量: {len(result['text_blocks'])}")
            print(f"  Markdown 长度: {len(result['markdown_text'])} 字符")

            print(f"\n前 3 个文本块:")
            for block in result['text_blocks'][:3]:
                text_preview = block['text_content'][:50] if block['text_content'] else "(empty)"
                print(f"  - [{block['block_type']}] {text_preview}...")
                print(f"    BBox: {block['bbox']}")

        except Exception as e:
            print(f"测试失败: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"\n测试图片不存在: {test_image}")


if __name__ == '__main__':
    import sys
    test_image = sys.argv[1] if len(sys.argv) > 1 else None
    test_ocr(test_image)
