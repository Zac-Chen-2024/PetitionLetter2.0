"""
EB-1A 证据需求清单 - 律师专业框架

证据金字塔：
- claim: 声明（申请人做了什么）
- proof: 证明（如何证明）
- significance: 重要性（为什么重要）← 最容易缺失
- context: 背景信息
"""

from typing import Dict, List

# 证据需求配置
EVIDENCE_REQUIREMENTS: Dict[str, Dict[str, List[Dict]]] = {

    "membership": {
        "claim": [
            {"key": "membership_certificate", "desc": "会员证书", "required": True},
        ],
        "proof": [
            {"key": "membership_criteria", "desc": "入会标准（年限、成就要求）", "required": True},
            {"key": "membership_evaluation", "desc": "评审流程", "required": False},
        ],
        "significance": [
            {"key": "peer_achievements", "desc": "其他杰出会员成就（奥运冠军等）", "required": True,
             "hints": ["Olympic", "champion", "gold medal", "其他会员", "members include"]},
            {"key": "evaluator_credentials", "desc": "评审人资质", "required": False,
             "hints": ["Vice President", "Director", "reviewed by"]},
            {"key": "selectivity_rate", "desc": "选择率/通过率", "required": False,
             "hints": ["%", "only", "仅有"]},
        ],
        "context": [
            {"key": "association_intro", "desc": "协会介绍", "required": True},
        ],
    },

    "published_material": {
        "claim": [
            {"key": "article_content", "desc": "报道内容", "required": True},
        ],
        "proof": [
            {"key": "publication_date", "desc": "发表日期", "required": True},
        ],
        "significance": [
            {"key": "circulation_data", "desc": "发行量/阅读量", "required": True,
             "hints": ["circulation", "copies", "readers", "views", "发行量", "阅读量"]},
            {"key": "media_awards", "desc": "媒体获奖", "required": True,
             "hints": ["award", "prize", "won", "awarded", "获奖"]},
            {"key": "media_ranking", "desc": "媒体地位（leading, top）", "required": False,
             "hints": ["leading", "top", "largest", "领先", "最大"]},
        ],
        "context": [
            {"key": "publication_intro", "desc": "媒体简介", "required": True},
        ],
    },

    "original_contribution": {
        "claim": [
            {"key": "contribution_description", "desc": "贡献描述", "required": True},
            {"key": "originality", "desc": "原创性说明（first, unique）", "required": True},
        ],
        "proof": [
            {"key": "expert_endorsement", "desc": "专家背书", "required": True},
            {"key": "adoption_evidence", "desc": "被采用证据", "required": False},
        ],
        "significance": [
            {"key": "quantitative_impact", "desc": "量化影响（用户数、浏览量、培训人数）", "required": True,
             "hints": ["views", "users", "coaches", "athletes", "orders", "万", "thousand"]},
            {"key": "geographic_reach", "desc": "地理覆盖（国家数）", "required": False,
             "hints": ["countries", "international", "global", "国家"]},
            {"key": "industry_recognition", "desc": "行业认可", "required": False,
             "hints": ["official partner", "cooperation", "合作伙伴"]},
        ],
        "context": [
            {"key": "expert_credentials", "desc": "背书专家资质", "required": True,
             "hints": ["Olympic", "President", "Champion", "gold medal"]},
        ],
    },

    "leading_role": {
        "claim": [
            {"key": "role_title", "desc": "职位名称", "required": True},
            {"key": "role_responsibilities", "desc": "职责描述", "required": True},
        ],
        "proof": [
            {"key": "role_documentation", "desc": "职位证明（营业执照、股权）", "required": True},
            {"key": "role_achievements", "desc": "任内成就", "required": True},
        ],
        "significance": [
            {"key": "org_reputation_proof", "desc": "组织声誉证明（AAA评级、官方合作）", "required": True,
             "hints": ["AAA", "credit rating", "official partner", "信用等级"]},
            {"key": "event_scale", "desc": "活动规模（参与人数、国家数）", "required": True,
             "hints": ["participants", "athletes", "countries", "万人", "人参与"]},
        ],
        "context": [
            {"key": "org_introduction", "desc": "组织介绍", "required": True},
        ],
    },

    "awards": {
        "claim": [
            {"key": "award_name", "desc": "奖项名称", "required": True},
        ],
        "proof": [
            {"key": "award_certificate", "desc": "获奖证书", "required": True},
        ],
        "significance": [
            {"key": "award_criteria", "desc": "评选标准", "required": True},
            {"key": "award_selectivity", "desc": "选择性（获奖人数）", "required": False},
            {"key": "past_recipients", "desc": "历届获奖者", "required": False},
        ],
        "context": [
            {"key": "awarding_org", "desc": "颁奖机构介绍", "required": True},
        ],
    },
}


def get_significance_hints(standard: str) -> List[str]:
    """获取重要性层的提取提示关键词"""
    all_hints = []
    if standard in EVIDENCE_REQUIREMENTS:
        for item in EVIDENCE_REQUIREMENTS[standard].get("significance", []):
            all_hints.extend(item.get("hints", []))
    return all_hints


def get_all_significance_hints() -> List[str]:
    """获取所有标准的重要性层提示"""
    all_hints = []
    for standard in EVIDENCE_REQUIREMENTS:
        all_hints.extend(get_significance_hints(standard))
    return list(set(all_hints))


def check_evidence_completeness(standard: str, extracted_keys: List[str]) -> Dict:
    """检查证据完整性"""
    if standard not in EVIDENCE_REQUIREMENTS:
        return {"complete": True, "missing": []}

    missing = []
    for layer, items in EVIDENCE_REQUIREMENTS[standard].items():
        for item in items:
            if item.get("required") and item["key"] not in extracted_keys:
                missing.append({
                    "key": item["key"],
                    "desc": item["desc"],
                    "layer": layer,
                    "hints": item.get("hints", [])
                })

    return {
        "complete": len(missing) == 0,
        "missing": missing,
        "coverage": 1 - len(missing) / sum(
            len([i for i in items if i.get("required")])
            for items in EVIDENCE_REQUIREMENTS[standard].values()
        ) if EVIDENCE_REQUIREMENTS[standard] else 1
    }
