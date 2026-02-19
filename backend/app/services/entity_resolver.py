"""
Entity Resolution Service - 实体消歧服务

三层融合方案：
- Layer 1: LLM 自动判断（本模块）
- Layer 2: 溯源系统回溯（待实现）
- Layer 3: Human-in-the-loop（前端配合）

设计原则：
- 全程 LLM 判断，无硬编码规则
- 复用已有溯源系统
- 仅在必要时打扰用户
"""

import json
import asyncio
from typing import Dict, List, Any, Optional, Tuple
from difflib import SequenceMatcher

from .llm_client import call_llm


# 相似度阈值
AUTO_MERGE_THRESHOLD = 0.85  # 自动合并阈值（降低以允许翻译变体）
HUMAN_REVIEW_THRESHOLD = 0.7  # 需要人工审核阈值


ENTITY_RESOLUTION_SCHEMA = {
    "type": "object",
    "properties": {
        "is_same_entity": {
            "type": "boolean",
            "description": "Whether the two entities refer to the same organization"
        },
        "confidence": {
            "type": "number",
            "description": "Confidence score between 0.0 and 1.0"
        },
        "reasoning": {
            "type": "string",
            "description": "Explanation for the decision"
        },
        "primary_name": {
            "type": "string",
            "description": "The recommended canonical name to use"
        }
    },
    "required": ["is_same_entity", "confidence", "reasoning"]
}


ENTITY_RESOLUTION_SYSTEM_PROMPT = """You are an expert at entity resolution in legal and immigration documents.

Your task is to determine if two entity names refer to the same organization, considering:
1. Name similarity (phonetic variations, transliteration differences, abbreviations)
2. Document context (same document, related pages)
3. Business information overlap (address, scope, registration)
4. Common translation variations (Chinese to English romanization: Pinyin vs other systems)

Common patterns to recognize:
- "Ying" vs "Yiqing" (翼擎 can be romanized differently)
- "Co., Ltd." vs "Co. Ltd." vs "Company Limited"
- Abbreviated vs full names

Return your analysis as a JSON object."""


ENTITY_RESOLUTION_USER_PROMPT = """Analyze if these two entities are the same organization:

ENTITY A:
- Name: {entity_a_name}
- Source: {entity_a_source}
- Context: {entity_a_context}

ENTITY B:
- Name: {entity_b_name}
- Source: {entity_b_source}
- Context: {entity_b_context}

Additional context from the same document:
{document_context}

Determine if Entity A and Entity B refer to the same organization.
Return your analysis as a JSON object with is_same_entity, confidence, reasoning, and primary_name fields."""


async def detect_entity_aliases(
    snippets: List[Dict],
    provider: str = "deepseek"
) -> Dict[str, Any]:
    """
    检测 snippets 中可能的实体别名

    策略：
    1. 按文档分组 snippets
    2. 提取每个文档中的实体名称
    3. 对同一文档中相似但不同的实体名称进行 LLM 判断

    Returns:
        {
            "confirmed_aliases": [
                {"primary": "...", "alias": "...", "confidence": 0.95, "reasoning": "..."}
            ],
            "suspected_aliases": [
                {"entity_a": "...", "entity_b": "...", "confidence": 0.7, "needs_human_review": True}
            ],
            "stats": {...}
        }
    """
    print("[EntityResolver] Detecting entity aliases...")

    # 计算每个实体名称的出现频率
    entity_frequency = _count_entity_frequency(snippets)

    # 按文档分组
    doc_entities = _group_entities_by_document(snippets)

    # 找出潜在的别名对
    candidate_pairs = _find_candidate_pairs(doc_entities)

    print(f"[EntityResolver] Found {len(candidate_pairs)} candidate pairs to analyze")

    confirmed_aliases = []
    suspected_aliases = []

    for pair in candidate_pairs:
        entity_a, entity_b, doc_context = pair

        # 使用 LLM 判断
        result = await _analyze_entity_pair(
            entity_a, entity_b, doc_context, provider
        )

        print(f"[EntityResolver] Analyzed: '{entity_a['name'][:30]}...' vs '{entity_b['name'][:30]}...'")
        print(f"[EntityResolver]   is_same: {result['is_same_entity']}, confidence: {result['confidence']}")

        if result["is_same_entity"]:
            if result["confidence"] >= AUTO_MERGE_THRESHOLD:
                # 选择 primary 的策略：
                # 1. 首先看出现频率（更频繁的通常是正确/标准名称）
                # 2. 频率相同时选择更长的名称
                primary, alias = _choose_primary_name(
                    entity_a["name"], entity_b["name"], entity_frequency
                )

                confirmed_aliases.append({
                    "primary": primary,
                    "alias": alias,
                    "confidence": result["confidence"],
                    "reasoning": result["reasoning"]
                })
                print(f"[EntityResolver] CONFIRMED: '{alias}' => '{primary}' ({result['confidence']:.2f})")
            elif result["confidence"] >= HUMAN_REVIEW_THRESHOLD:
                # 选择 primary 的策略同上
                suggested_primary, suggested_alias = _choose_primary_name(
                    entity_a["name"], entity_b["name"], entity_frequency
                )

                suspected_aliases.append({
                    "entity_a": entity_a["name"],
                    "entity_b": entity_b["name"],
                    "suggested_primary": suggested_primary,
                    "suggested_alias": suggested_alias,
                    "confidence": result["confidence"],
                    "reasoning": result["reasoning"],
                    "needs_human_review": True
                })
                print(f"[EntityResolver] SUSPECTED: '{suggested_alias}' ~ '{suggested_primary}' ({result['confidence']:.2f}) - needs review")

    # 合并和去重别名（处理传递性：如果 A=>B, B=>C，则 A=>C）
    confirmed_aliases = _merge_transitive_aliases(confirmed_aliases, entity_frequency)

    return {
        "confirmed_aliases": confirmed_aliases,
        "suspected_aliases": suspected_aliases,
        "stats": {
            "candidates_analyzed": len(candidate_pairs),
            "confirmed": len(confirmed_aliases),
            "needs_review": len(suspected_aliases)
        }
    }


def _count_entity_frequency(snippets: List[Dict]) -> Dict[str, int]:
    """统计每个实体名称在 snippets 中的出现次数"""
    frequency = {}
    for snippet in snippets:
        subject = snippet.get("subject", "").strip()
        if subject:
            key = subject.lower()
            frequency[key] = frequency.get(key, 0) + 1
    return frequency


def _choose_primary_name(
    name_a: str,
    name_b: str,
    frequency: Dict[str, int]
) -> Tuple[str, str]:
    """
    选择 primary name 的策略：
    1. 如果长度差异很小（<=3字符），按频率选择（避免 OCR 拼写错误）
    2. 如果长度差异较大（>3字符），选择更长的名称（法律实体完整性）
    3. 长度相同时，选择出现频率更高的

    法律考量：对于 EB-1A 申请，更长/更完整的名称通常是官方法律实体名称，
    例如 "Venus Weightlifting Club" 优于 "Venus Weightlifting"
    但需要避免 OCR 错误如 "Venues" 被选为 primary

    Returns:
        (primary, alias)
    """
    freq_a = frequency.get(name_a.lower(), 0)
    freq_b = frequency.get(name_b.lower(), 0)
    len_diff = abs(len(name_a) - len(name_b))

    # 小长度差异：可能是 OCR 拼写错误，按频率选择
    if len_diff <= 3:
        if freq_a > freq_b:
            return name_a, name_b
        elif freq_b > freq_a:
            return name_b, name_a
        else:
            # 频率相同，选择更长的
            if len(name_a) >= len(name_b):
                return name_a, name_b
            else:
                return name_b, name_a
    else:
        # 大长度差异：选择更长的名称（完整法律实体名称）
        if len(name_a) > len(name_b):
            return name_a, name_b
        else:
            return name_b, name_a


def _merge_transitive_aliases(
    aliases: List[Dict],
    frequency: Dict[str, int]
) -> List[Dict]:
    """
    合并传递性别名，确保所有别名都指向同一个最终 primary

    使用 Union-Find 算法找到所有连通的实体，然后选择频率最高的作为 primary

    Returns:
        去重和合并后的别名列表
    """
    if not aliases:
        return []

    # 收集所有实体名称
    all_names = set()
    for a in aliases:
        all_names.add(a["alias"].lower())
        all_names.add(a["primary"].lower())

    # 收集原始名称（保留大小写）
    name_case_map = {}
    for a in aliases:
        name_case_map[a["alias"].lower()] = a["alias"]
        name_case_map[a["primary"].lower()] = a["primary"]

    # Union-Find 数据结构
    parent = {name: name for name in all_names}

    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    # 构建连通组
    for a in aliases:
        union(a["alias"].lower(), a["primary"].lower())

    # 找到每个组的成员
    groups = {}
    for name in all_names:
        root = find(name)
        if root not in groups:
            groups[root] = []
        groups[root].append(name)

    # 对每个组选择 primary（频率最高 + 最长）
    result = []
    for root, members in groups.items():
        if len(members) <= 1:
            continue

        # 按频率降序，然后按长度降序排序
        def score(name):
            return (frequency.get(name, 0), len(name))

        members_sorted = sorted(members, key=score, reverse=True)
        primary_key = members_sorted[0]
        primary = name_case_map.get(primary_key, primary_key)

        # 其他成员都是 alias
        for alias_key in members_sorted[1:]:
            alias = name_case_map.get(alias_key, alias_key)
            result.append({
                "primary": primary,
                "alias": alias,
                "confidence": 0.85,
                "reasoning": f"Merged alias: {alias} => {primary}"
            })

    print(f"[EntityResolver] Merged {len(aliases)} raw aliases into {len(result)} final aliases")

    return result


def _group_entities_by_document(snippets: List[Dict]) -> Dict[str, List[Dict]]:
    """按文档分组实体"""
    doc_entities = {}

    for snippet in snippets:
        doc_id = snippet.get("exhibit_id", "unknown")
        subject = snippet.get("subject", "").strip()

        if not subject:
            continue

        if doc_id not in doc_entities:
            doc_entities[doc_id] = []

        # 记录实体及其来源信息
        entity_info = {
            "name": subject,
            "snippet_id": snippet.get("snippet_id", ""),
            "page": snippet.get("page", 0),
            "text": snippet.get("text", "")[:200],
            "exhibit_id": doc_id
        }

        # 避免重复
        existing_names = [e["name"] for e in doc_entities[doc_id]]
        if subject not in existing_names:
            doc_entities[doc_id].append(entity_info)

    return doc_entities


def _find_candidate_pairs(doc_entities: Dict[str, List[Dict]]) -> List[Tuple]:
    """
    找出潜在的别名对

    策略：
    1. 同一文档中，名称相似但不完全相同的实体
    2. 跨文档，名称高度相似的实体（可能是翻译变体）
    """
    candidates = []
    seen_pairs = set()

    # 收集所有实体
    all_entities = []
    for doc_id, entities in doc_entities.items():
        all_entities.extend(entities)

    # 跨文档比较
    for i in range(len(all_entities)):
        for j in range(i + 1, len(all_entities)):
            entity_a = all_entities[i]
            entity_b = all_entities[j]

            # 跳过完全相同的名称
            if entity_a["name"].lower() == entity_b["name"].lower():
                continue

            # 避免重复
            pair_key = tuple(sorted([entity_a["name"], entity_b["name"]]))
            if pair_key in seen_pairs:
                continue

            # 计算字符串相似度
            similarity = _calculate_similarity(entity_a["name"], entity_b["name"])

            # 相似度在 0.6-0.99 之间的才是候选
            # 提高上限到 0.99 以捕获 "Ying" vs "Yiqing" 这种高相似度但不同的情况
            if 0.6 <= similarity < 0.99:
                seen_pairs.add(pair_key)

                # 收集文档上下文
                if entity_a["exhibit_id"] == entity_b["exhibit_id"]:
                    doc_context = f"Both entities appear in the same document ({entity_a['exhibit_id']})."
                else:
                    doc_context = f"Entity A from {entity_a['exhibit_id']}, Entity B from {entity_b['exhibit_id']}. May be related documents."

                candidates.append((entity_a, entity_b, doc_context))

    return candidates


def _calculate_similarity(name_a: str, name_b: str) -> float:
    """计算两个名称的相似度"""
    # 规范化
    a = name_a.lower().strip()
    b = name_b.lower().strip()

    # 移除常见后缀进行比较
    suffixes = ["co., ltd.", "co. ltd.", "co.,ltd.", "co ltd", "pte. ltd.", "pte ltd", "inc.", "inc", "llc"]
    for suffix in suffixes:
        a = a.replace(suffix, "").strip()
        b = b.replace(suffix, "").strip()

    return SequenceMatcher(None, a, b).ratio()


async def _analyze_entity_pair(
    entity_a: Dict,
    entity_b: Dict,
    doc_context: str,
    provider: str
) -> Dict[str, Any]:
    """使用 LLM 分析实体对"""

    user_prompt = ENTITY_RESOLUTION_USER_PROMPT.format(
        entity_a_name=entity_a["name"],
        entity_a_source=f"Exhibit {entity_a['exhibit_id']}, Page {entity_a['page']}",
        entity_a_context=entity_a["text"][:150] + "...",
        entity_b_name=entity_b["name"],
        entity_b_source=f"Exhibit {entity_b['exhibit_id']}, Page {entity_b['page']}",
        entity_b_context=entity_b["text"][:150] + "...",
        document_context=doc_context
    )

    try:
        result = await call_llm(
            prompt=user_prompt,
            provider=provider,
            system_prompt=ENTITY_RESOLUTION_SYSTEM_PROMPT,
            json_schema=ENTITY_RESOLUTION_SCHEMA,
            temperature=0.1,
            max_tokens=500
        )

        # 确保类型正确
        is_same = result.get("is_same_entity", False)
        if isinstance(is_same, str):
            is_same = is_same.lower() == "true"

        confidence = result.get("confidence", 0.0)
        if isinstance(confidence, str):
            # 处理文字描述的置信度
            confidence_map = {
                "very high": 0.95,
                "high": 0.85,
                "medium": 0.7,
                "moderate": 0.7,
                "low": 0.4,
                "very low": 0.2
            }
            confidence_lower = confidence.lower().strip()
            if confidence_lower in confidence_map:
                confidence = confidence_map[confidence_lower]
            else:
                try:
                    confidence = float(confidence)
                except:
                    # 如果 is_same 为 True 但没有数字置信度，给一个默认值
                    confidence = 0.8 if is_same else 0.2

        return {
            "is_same_entity": is_same,
            "confidence": confidence,
            "reasoning": result.get("reasoning", ""),
            "primary_name": result.get("primary_name", entity_a["name"])
        }

    except Exception as e:
        print(f"[EntityResolver] Error analyzing pair: {e}")
        return {
            "is_same_entity": False,
            "confidence": 0.0,
            "reasoning": f"Error: {str(e)}",
            "primary_name": entity_a["name"]
        }


def apply_entity_aliases(
    snippets: List[Dict],
    aliases: List[Dict]
) -> List[Dict]:
    """
    应用实体别名，统一 snippet 中的实体名称

    Args:
        snippets: 原始 snippets
        aliases: 已确认的别名列表 [{"primary": "...", "alias": "..."}]

    Returns:
        更新后的 snippets
    """
    # 构建别名映射
    alias_map = {}
    for a in aliases:
        alias_map[a["alias"].lower()] = a["primary"]

    # 应用到 snippets
    updated_snippets = []
    updates_count = 0

    for snippet in snippets:
        new_snippet = snippet.copy()
        subject = snippet.get("subject", "").strip()

        if subject.lower() in alias_map:
            new_snippet["subject"] = alias_map[subject.lower()]
            new_snippet["original_subject"] = subject  # 保留原始值
            updates_count += 1

        updated_snippets.append(new_snippet)

    print(f"[EntityResolver] Applied aliases to {updates_count} snippets")

    return updated_snippets


async def resolve_entities_for_snippets(
    snippets: List[Dict],
    provider: str = "deepseek"
) -> Tuple[List[Dict], Dict[str, Any]]:
    """
    完整的实体消歧流程

    Returns:
        (updated_snippets, resolution_report)
    """
    # Step 1: 检测别名
    detection_result = await detect_entity_aliases(snippets, provider)

    # Step 2: 应用已确认的别名
    updated_snippets = apply_entity_aliases(
        snippets,
        detection_result["confirmed_aliases"]
    )

    # Step 3: 生成报告
    report = {
        "confirmed_aliases": detection_result["confirmed_aliases"],
        "suspected_aliases": detection_result["suspected_aliases"],
        "stats": detection_result["stats"],
        "snippets_updated": len([s for s in updated_snippets if "original_subject" in s])
    }

    return updated_snippets, report
