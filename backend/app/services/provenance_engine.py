"""
Provenance Engine - 句子级溯源引擎

提供句子 → snippet 的溯源能力，以及反向溯源 (snippet → 句子)

溯源方式：
1. 显式标注：句子级标注中的 snippet_ids → confidence 1.0
2. 语义 fallback：文本相似度匹配 → confidence × 0.7

不需要 GPU：文本相似度 fallback 足够，embedding 为可选升级
"""

import re
from typing import List, Dict, Optional, Tuple
from difflib import SequenceMatcher

from .snippet_registry import load_registry, get_snippet_by_id
from .petition_writer import load_constrained_writing, load_all_constrained_writing


def resolve_provenance(
    project_id: str,
    section: str,
    sentence_index: int,
    method: str = "hybrid"
) -> Dict:
    """
    解析句子的溯源信息

    Args:
        project_id: 项目 ID
        section: 标准 key
        sentence_index: 句子索引
        method: "explicit" | "semantic" | "hybrid"

    Returns:
        {
            "sentence_index": int,
            "sentence_text": str,
            "snippets": [
                {
                    "snippet_id": str,
                    "confidence": float,  # 1.0 = 显式, 0.7 = 语义
                    "match_type": "explicit" | "semantic",
                    "text": str,
                    "exhibit_id": str,
                    "page": int,
                    "bbox": dict
                }
            ],
            "total_matches": int
        }
    """
    # 加载写作结果
    writing = load_constrained_writing(project_id, section)
    if not writing:
        return {
            "sentence_index": sentence_index,
            "sentence_text": "",
            "snippets": [],
            "total_matches": 0,
            "error": "Writing not found"
        }

    sentences = writing.get("sentences", [])
    if sentence_index >= len(sentences):
        return {
            "sentence_index": sentence_index,
            "sentence_text": "",
            "snippets": [],
            "total_matches": 0,
            "error": "Sentence index out of range"
        }

    sentence = sentences[sentence_index]
    sentence_text = sentence.get("text", "")
    explicit_ids = sentence.get("snippet_ids", [])

    # 加载 snippet 注册表
    snippet_registry = load_registry(project_id)
    snippet_map = {s["snippet_id"]: s for s in snippet_registry}

    results = []

    # 1. 显式标注
    if method in ("explicit", "hybrid"):
        for sid in explicit_ids:
            if sid in snippet_map:
                s = snippet_map[sid]
                results.append({
                    "snippet_id": sid,
                    "confidence": 1.0,
                    "match_type": "explicit",
                    "text": s.get("text", ""),
                    "exhibit_id": s.get("exhibit_id", ""),
                    "page": s.get("page", 0),
                    "bbox": s.get("bbox")
                })

    # 2. 语义 fallback
    if method in ("semantic", "hybrid"):
        # 只在显式标注不足时使用语义匹配
        if len(results) < 2:
            semantic_matches = _semantic_match(
                sentence_text,
                snippet_registry,
                exclude_ids=set(explicit_ids),
                top_k=5 - len(results)
            )

            for match in semantic_matches:
                # 语义匹配的置信度打折
                match["confidence"] = round(match["confidence"] * 0.7, 2)
                match["match_type"] = "semantic"
                results.append(match)

    # 按置信度排序
    results.sort(key=lambda x: x["confidence"], reverse=True)

    # 只返回 top 5
    results = results[:5]

    return {
        "sentence_index": sentence_index,
        "sentence_text": sentence_text,
        "snippets": results,
        "total_matches": len(results)
    }


def resolve_reverse_provenance(
    project_id: str,
    snippet_id: str
) -> Dict:
    """
    反向溯源：查找引用了某个 snippet 的所有句子

    Args:
        project_id: 项目 ID
        snippet_id: Snippet ID

    Returns:
        {
            "snippet_id": str,
            "snippet_text": str,
            "sentences": [
                {
                    "section": str,
                    "sentence_index": int,
                    "sentence_text": str,
                    "confidence": float,
                    "match_type": "explicit" | "semantic"
                }
            ],
            "total_references": int
        }
    """
    # 获取 snippet 信息
    snippet = get_snippet_by_id(project_id, snippet_id)
    if not snippet:
        return {
            "snippet_id": snippet_id,
            "snippet_text": "",
            "sentences": [],
            "total_references": 0,
            "error": "Snippet not found"
        }

    snippet_text = snippet.get("text", "")

    # 加载所有写作结果
    all_writing = load_all_constrained_writing(project_id)

    results = []

    for section, writing in all_writing.items():
        sentences = writing.get("sentences", [])

        for idx, sentence in enumerate(sentences):
            sentence_text = sentence.get("text", "")
            explicit_ids = sentence.get("snippet_ids", [])

            # 检查显式引用
            if snippet_id in explicit_ids:
                results.append({
                    "section": section,
                    "sentence_index": idx,
                    "sentence_text": sentence_text,
                    "confidence": 1.0,
                    "match_type": "explicit"
                })
            else:
                # 检查语义相似
                similarity = _text_similarity(sentence_text, snippet_text)
                if similarity >= 0.4:  # 阈值
                    results.append({
                        "section": section,
                        "sentence_index": idx,
                        "sentence_text": sentence_text,
                        "confidence": round(similarity * 0.7, 2),
                        "match_type": "semantic"
                    })

    # 按置信度排序
    results.sort(key=lambda x: x["confidence"], reverse=True)

    return {
        "snippet_id": snippet_id,
        "snippet_text": snippet_text,
        "sentences": results,
        "total_references": len(results)
    }


def get_bbox_for_snippets(
    project_id: str,
    snippet_ids: List[str]
) -> List[Dict]:
    """
    获取多个 snippets 的 BBox 坐标

    用于前端高亮显示

    Returns:
        [
            {
                "snippet_id": str,
                "exhibit_id": str,
                "page": int,
                "bbox": {x1, y1, x2, y2}
            }
        ]
    """
    snippet_registry = load_registry(project_id)
    snippet_map = {s["snippet_id"]: s for s in snippet_registry}

    results = []
    for sid in snippet_ids:
        if sid in snippet_map:
            s = snippet_map[sid]
            if s.get("bbox"):
                results.append({
                    "snippet_id": sid,
                    "exhibit_id": s.get("exhibit_id", ""),
                    "page": s.get("page", 0),
                    "bbox": s.get("bbox")
                })

    return results


def get_section_provenance_summary(
    project_id: str,
    section: str
) -> Dict:
    """
    获取整个 section 的溯源摘要

    Returns:
        {
            "section": str,
            "sentence_count": int,
            "annotated_count": int,  # 有 snippet_ids 的句子数
            "coverage": float,  # 标注覆盖率
            "snippet_usage": {snippet_id: count}  # 每个 snippet 被引用的次数
        }
    """
    writing = load_constrained_writing(project_id, section)
    if not writing:
        return {
            "section": section,
            "sentence_count": 0,
            "annotated_count": 0,
            "coverage": 0,
            "snippet_usage": {}
        }

    sentences = writing.get("sentences", [])
    sentence_count = len(sentences)
    annotated_count = 0
    snippet_usage = {}

    for sentence in sentences:
        snippet_ids = sentence.get("snippet_ids", [])
        if snippet_ids:
            annotated_count += 1

        for sid in snippet_ids:
            snippet_usage[sid] = snippet_usage.get(sid, 0) + 1

    return {
        "section": section,
        "sentence_count": sentence_count,
        "annotated_count": annotated_count,
        "coverage": round(annotated_count / sentence_count * 100, 1) if sentence_count > 0 else 0,
        "snippet_usage": snippet_usage
    }


# ==================== 辅助函数 ====================

def _semantic_match(
    sentence_text: str,
    snippet_registry: List[Dict],
    exclude_ids: set = None,
    top_k: int = 3
) -> List[Dict]:
    """
    语义匹配：找到与句子最相似的 snippets

    使用文本相似度（SequenceMatcher），不需要 embedding
    """
    if exclude_ids is None:
        exclude_ids = set()

    # 提取句子中的关键词/实体
    sentence_lower = sentence_text.lower()

    candidates = []

    for s in snippet_registry:
        sid = s.get("snippet_id", "")
        if sid in exclude_ids:
            continue

        snippet_text = s.get("text", "")
        if not snippet_text:
            continue

        # 计算相似度
        similarity = _text_similarity(sentence_text, snippet_text)

        if similarity >= 0.3:  # 最低阈值
            candidates.append({
                "snippet_id": sid,
                "confidence": similarity,
                "text": snippet_text,
                "exhibit_id": s.get("exhibit_id", ""),
                "page": s.get("page", 0),
                "bbox": s.get("bbox")
            })

    # 按相似度排序
    candidates.sort(key=lambda x: x["confidence"], reverse=True)

    return candidates[:top_k]


def _text_similarity(text1: str, text2: str) -> float:
    """
    计算两段文本的相似度

    组合使用：
    1. SequenceMatcher (编辑距离)
    2. 词重叠度
    3. 数字/实体匹配
    """
    if not text1 or not text2:
        return 0.0

    text1_lower = text1.lower()
    text2_lower = text2.lower()

    # 1. SequenceMatcher 相似度
    seq_ratio = SequenceMatcher(None, text1_lower, text2_lower).ratio()

    # 2. 词重叠度
    words1 = set(_extract_words(text1_lower))
    words2 = set(_extract_words(text2_lower))

    if not words1 or not words2:
        word_overlap = 0.0
    else:
        intersection = words1 & words2
        word_overlap = len(intersection) / min(len(words1), len(words2))

    # 3. 数字匹配
    numbers1 = set(_extract_numbers(text1))
    numbers2 = set(_extract_numbers(text2))

    if numbers1 and numbers2:
        number_overlap = len(numbers1 & numbers2) / max(len(numbers1), len(numbers2))
    else:
        number_overlap = 0.0

    # 加权平均
    similarity = (
        seq_ratio * 0.3 +
        word_overlap * 0.5 +
        number_overlap * 0.2
    )

    return round(similarity, 3)


def _extract_words(text: str) -> List[str]:
    """提取有意义的词（过滤停用词）"""
    # 简单的停用词列表
    stopwords = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
        'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'them',
        'his', 'her', 'their', 'our', 'your', 'my', 'which', 'who', 'whom',
        'whose', 'what', 'where', 'when', 'why', 'how', 'all', 'each', 'every',
        'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
        'only', 'same', 'so', 'than', 'too', 'very', 'just', 'also'
    }

    words = re.findall(r'\b[a-z]{3,}\b', text.lower())
    return [w for w in words if w not in stopwords]


def _extract_numbers(text: str) -> List[str]:
    """提取数字（包括带单位的）"""
    # 匹配各种数字格式
    patterns = [
        r'\$[\d,]+(?:\.\d+)?',  # $100,000.00
        r'[\d,]+(?:\.\d+)?%',   # 85.5%
        r'\d{4}',               # 年份 2024
        r'\d+(?:,\d{3})+',      # 大数字 1,000,000
        r'\d+(?:\.\d+)?'        # 普通数字
    ]

    numbers = []
    for pattern in patterns:
        numbers.extend(re.findall(pattern, text))

    return numbers
