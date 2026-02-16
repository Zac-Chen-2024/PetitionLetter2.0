"""
LLM Placeholder - 模拟 LLM 响应用于演示和开发

功能:
- mock_extract_snippets() - 基于规则的证据提取
- mock_classify_snippet() - 基于关键词的 EB-1A 标准分类
- mock_generate_petition() - 模拟 petition 生成

后续可替换为真实 LLM API 调用 (OpenAI, Claude 等)
"""

import re
from typing import List, Dict, Optional

# EB-1A 标准关键词映射
STANDARD_KEYWORDS = {
    "awards": [
        r"\b(award|prize|medal|honor|recognition|winner|champion|gold|silver|bronze)\b",
        r"\b(first place|top|best|outstanding|excellence)\b",
        r"\b(world record|national record|olympic|championship)\b"
    ],
    "membership": [
        r"\b(member|fellow|association|society|organization)\b",
        r"\b(elected|inducted|committee|board)\b",
        r"\b(professional organization|elite group)\b"
    ],
    "published_material": [
        r"\b(published|article|interview|featured|media)\b",
        r"\b(press|newspaper|magazine|journal|coverage)\b",
        r"\b(report|profile|story about)\b"
    ],
    "judging": [
        r"\b(judge|jury|reviewer|evaluator|panel)\b",
        r"\b(assess|evaluate|peer review|referee)\b",
        r"\b(competition judge|selection committee)\b"
    ],
    "original_contribution": [
        r"\b(develop|create|invent|innovate|pioneer)\b",
        r"\b(breakthrough|method|technique|system|approach)\b",
        r"\b(significant|impact|influence|unique|original)\b",
        r"\b(training method|rehabilitation|posture correction)\b"
    ],
    "scholarly_articles": [
        r"\b(author|publish|paper|research|journal)\b",
        r"\b(conference|citation|academic|peer-reviewed)\b",
        r"\b(thesis|dissertation|study|findings)\b"
    ],
    "exhibitions": [
        r"\b(exhibition|display|showcase|gallery|show)\b",
        r"\b(performance|demonstration|presentation)\b",
        r"\b(competed|tournament|games)\b"
    ],
    "leading_role": [
        r"\b(director|founder|CEO|president|head|chief)\b",
        r"\b(lead|principal|key role|critical|leadership)\b",
        r"\b(established|founded|built|manage|oversee)\b"
    ]
}

# 证据类型模式
EVIDENCE_PATTERNS = {
    # 数量和金额
    "salary_high": r"\$[\d,]+(?:,\d{3})*|\d+(?:,\d{3})*\s*(?:USD|dollars?|yuan|RMB)",
    "percentage": r"\d+(?:\.\d+)?%",
    "ranking": r"(?:ranked?|top)\s*\d+|#\d+|first|second|third",

    # 时间和日期
    "date_range": r"\d{4}\s*[-–]\s*(?:\d{4}|present|current)",
    "year": r"\b(?:19|20)\d{2}\b",

    # 组织和头衔
    "organization": r"(?:University|Institute|Association|Federation|Committee|Company|Inc\.|Ltd\.)",
    "title": r"(?:Dr\.|Professor|Coach|Director|Founder|President|CEO|Head)",

    # 成就和认可
    "achievement": r"(?:achieved|received|awarded|won|earned|obtained)",
    "recognition": r"(?:recognized|acknowledged|certified|licensed)"
}


def detect_evidence_type(text: str) -> List[str]:
    """检测文本中的证据类型"""
    found_types = []
    text_lower = text.lower()

    for evidence_type, pattern in EVIDENCE_PATTERNS.items():
        if re.search(pattern, text, re.IGNORECASE):
            found_types.append(evidence_type)

    return found_types


def classify_text_to_standard(text: str) -> tuple:
    """
    根据关键词将文本分类到 EB-1A 标准

    Returns:
        (standard_key, confidence)
    """
    text_lower = text.lower()
    scores = {}

    for standard, patterns in STANDARD_KEYWORDS.items():
        score = 0
        for pattern in patterns:
            matches = re.findall(pattern, text_lower)
            score += len(matches)
        if score > 0:
            scores[standard] = score

    if not scores:
        return ("", 0.0)

    # 选择得分最高的标准
    best_standard = max(scores.keys(), key=lambda k: scores[k])
    max_score = scores[best_standard]

    # 计算置信度 (基于匹配数量)
    confidence = min(0.9, 0.3 + (max_score * 0.15))

    return (best_standard, confidence)


def mock_extract_snippets(text: str, exhibit_id: str) -> List[Dict]:
    """
    基于规则的模拟 snippet 提取

    模拟 LLM 从段落中提取有意义的证据片段

    Args:
        text: 输入段落文本
        exhibit_id: 展品 ID (用于上下文推断)

    Returns:
        提取的证据列表 [{text, standard_key, confidence}]
    """
    if len(text) < 20:
        return []

    extracted = []

    # 检测证据类型
    evidence_types = detect_evidence_type(text)

    # 分类到标准
    standard_key, confidence = classify_text_to_standard(text)

    # 根据 exhibit_id 前缀推断类型
    exhibit_prefix = exhibit_id[0].upper() if exhibit_id else ""
    exhibit_hints = {
        "A": "leading_role",      # 通常是简历
        "B": "published_material",  # 推荐信
        "C": "awards",             # 奖项证书
        "D": "original_contribution",  # 作品/贡献
        "E": "scholarly_articles",  # 论文
        "F": "membership",         # 会员证明
        "G": "judging",            # 评审证明
        "H": "exhibitions"         # 展览/比赛
    }

    # 如果关键词分类没有结果，使用展品前缀推断
    if not standard_key and exhibit_prefix in exhibit_hints:
        standard_key = exhibit_hints[exhibit_prefix]
        confidence = 0.4  # 较低置信度

    # 如果文本足够长且有证据类型，则提取
    if len(text) > 30 and (standard_key or evidence_types):
        extracted.append({
            "text": text.strip(),
            "standard_key": standard_key,
            "confidence": confidence if standard_key else 0.3,
            "evidence_types": evidence_types
        })

    # 尝试拆分长文本为多个证据点
    if len(text) > 200:
        # 按句号分割
        sentences = re.split(r'(?<=[.!?])\s+', text)
        for sent in sentences:
            if len(sent) > 50:
                sent_standard, sent_conf = classify_text_to_standard(sent)
                if sent_standard and sent_standard != standard_key:
                    extracted.append({
                        "text": sent.strip(),
                        "standard_key": sent_standard,
                        "confidence": sent_conf,
                        "evidence_types": detect_evidence_type(sent)
                    })

    return extracted


def mock_classify_snippet(text: str) -> Dict:
    """
    对单个 snippet 进行分类

    Args:
        text: snippet 文本

    Returns:
        {standard_key, confidence, reasoning}
    """
    standard_key, confidence = classify_text_to_standard(text)

    reasoning = ""
    if standard_key:
        reasoning = f"Text contains keywords matching '{standard_key}' category"
    else:
        reasoning = "No clear keyword matches found"

    return {
        "standard_key": standard_key,
        "confidence": confidence,
        "reasoning": reasoning
    }


def mock_generate_petition_section(
    standard_key: str,
    snippets: List[Dict]
) -> Dict:
    """
    模拟生成 petition 章节

    Args:
        standard_key: EB-1A 标准类型
        snippets: 该标准下的证据 snippets

    Returns:
        {
            section: standard_key,
            title: 章节标题,
            sentences: [{text, snippet_ids}]
        }
    """
    # 标准标题映射
    SECTION_TITLES = {
        "awards": "Receipt of Nationally or Internationally Recognized Awards",
        "membership": "Membership in Associations Requiring Outstanding Achievements",
        "published_material": "Published Material About the Beneficiary",
        "judging": "Participation as a Judge of Others' Work",
        "original_contribution": "Original Contributions of Major Significance",
        "scholarly_articles": "Authorship of Scholarly Articles",
        "exhibitions": "Display of Work at Artistic Exhibitions",
        "leading_role": "Leading or Critical Role for Distinguished Organizations"
    }

    title = SECTION_TITLES.get(standard_key, standard_key.replace("_", " ").title())

    if not snippets:
        return {
            "section": standard_key,
            "title": title,
            "sentences": []
        }

    sentences = []

    # 开头句
    intro_text = f"The beneficiary has demonstrated exceptional achievement in the area of {title.lower()}."
    sentences.append({
        "text": intro_text,
        "snippet_ids": []
    })

    # 为每个 snippet 生成一个句子
    for i, snp in enumerate(snippets[:5]):  # 最多使用 5 个 snippets
        snippet_text = snp.get("text", "")[:200]
        snippet_id = snp.get("snippet_id", "")

        # 生成引用句子
        if i == 0:
            sent = f"As evidenced by the documentation, {snippet_text[:100].lower()}..."
        else:
            sent = f"Furthermore, the record shows that {snippet_text[:80].lower()}..."

        sentences.append({
            "text": sent,
            "snippet_ids": [snippet_id] if snippet_id else []
        })

    # 结尾句
    conclusion = f"This evidence clearly establishes the beneficiary's extraordinary ability as demonstrated through {title.lower()}."
    sentences.append({
        "text": conclusion,
        "snippet_ids": [s.get("snippet_id") for s in snippets[:3] if s.get("snippet_id")]
    })

    return {
        "section": standard_key,
        "title": title,
        "sentences": sentences
    }


def mock_generate_full_petition(
    project_id: str,
    snippets_by_standard: Dict[str, List[Dict]]
) -> Dict:
    """
    生成完整的 petition

    Args:
        project_id: 项目 ID
        snippets_by_standard: {standard_key: [snippets]}

    Returns:
        完整的 petition 结构
    """
    sections = []

    # 按标准顺序生成各章节
    standard_order = [
        "awards",
        "membership",
        "published_material",
        "judging",
        "original_contribution",
        "scholarly_articles",
        "exhibitions",
        "leading_role"
    ]

    for std_key in standard_order:
        if std_key in snippets_by_standard:
            section = mock_generate_petition_section(
                std_key,
                snippets_by_standard[std_key]
            )
            if section["sentences"]:
                sections.append(section)

    return {
        "project_id": project_id,
        "version": "1.0",
        "generated_by": "llm_placeholder",
        "sections": sections
    }
