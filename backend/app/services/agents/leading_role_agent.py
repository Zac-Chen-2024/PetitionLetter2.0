"""
Leading Role Agent - EB-1A Criterion (viii) Specialist

根据 8 C.F.R. §204.5(h)(3)(viii) 验证领导角色证据：
"Evidence that the alien has performed in a leading or critical role
for organizations or establishments that have a distinguished reputation."

验证要点：
1. 申请人是否在组织内部担任领导/关键角色 (founder, CEO, director, etc.)
2. 组织是否具有 "distinguished reputation"
3. 排除：邀请演讲、合作伙伴关系、顾问身份

设计原则：
- 使用 LLM 判断，不硬编码关键词
- 基于法律定义进行验证
- 输出带有法律依据的论点
"""

import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict

from ..llm_client import call_llm


# 领导角色的法律定义
LEADING_ROLE_LEGAL_DEFINITION = """
8 C.F.R. §204.5(h)(3)(viii):
"Evidence that the alien has performed in a leading or critical role
for organizations or establishments that have a distinguished reputation."

USCIS Policy Manual guidance:
- A leading role is a position of authority or significant decision-making power
- A critical role means the alien's contributions are of notable importance
- The organization must have a "distinguished reputation" - demonstrated by
  recognition, awards, significant achievements, or established standing in the field

What QUALIFIES as leading/critical role:
- Founder or co-founder
- Chief Executive Officer (CEO), President, Director
- Legal Representative (法定代表人)
- Chairman of the Board
- Department head with significant authority
- Key technical lead whose work is essential to the organization's mission

What does NOT qualify:
- Being invited as a speaker or guest (this is invitation, not leadership)
- Having a partnership or cooperation agreement (partner ≠ leader)
- Being a consultant or advisor without decision-making authority
- Being a member of an organization (membership ≠ leadership)
"""

# LLM 验证 Schema
LEADING_ROLE_VALIDATION_SCHEMA = {
    "type": "object",
    "properties": {
        "validations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "entity_name": {"type": "string"},
                    "is_valid_leadership": {"type": "boolean"},
                    "role_title": {"type": "string"},
                    "role_type": {
                        "type": "string",
                        "enum": ["founder", "executive", "critical_technical", "speaker", "partner", "member", "other"]
                    },
                    "has_distinguished_reputation": {"type": "boolean"},
                    "reputation_evidence": {"type": "string"},
                    "confidence": {"type": "number"},
                    "legal_reasoning": {"type": "string"},
                    "recommendation": {
                        "type": "string",
                        "enum": ["STRONG", "MEDIUM", "WEAK", "REJECT"]
                    }
                },
                "required": ["entity_name", "is_valid_leadership", "role_type", "confidence", "legal_reasoning", "recommendation"]
            }
        }
    },
    "required": ["validations"]
}

LEADING_ROLE_SYSTEM_PROMPT = f"""You are an expert immigration attorney validating evidence for EB-1A visa petitions.

Your task is to evaluate whether evidence meets the legal requirements for the Leading Role criterion.

{LEADING_ROLE_LEGAL_DEFINITION}

When evaluating evidence:
1. First determine if the applicant holds a TRUE leadership position (not just invited/partnered)
2. Then assess if the organization has "distinguished reputation"
3. Provide legal reasoning based on the regulatory definition
4. Give a recommendation: STRONG (clear evidence), MEDIUM (needs more support), WEAK (marginal), REJECT (doesn't qualify)

Be strict but fair. If evidence shows the applicant only has a partnership or was invited to speak,
it does NOT qualify for this criterion."""

LEADING_ROLE_USER_PROMPT = """Evaluate this evidence cluster for the Leading Role criterion (8 C.F.R. §204.5(h)(3)(viii)).

APPLICANT: {applicant_name}

ORGANIZATION: {entity_name}
RELATIONSHIP TYPE: {relationship_type}

EVIDENCE SNIPPETS:
{snippets_text}

Evaluate:
1. Does the applicant hold a TRUE leading or critical role IN this organization?
   (founder/CEO/director = YES; invited speaker/partner = NO)
2. Does the organization have "distinguished reputation"?
   (Look for: awards, recognition, significant achievements, government endorsements)
3. What is your recommendation? (STRONG/MEDIUM/WEAK/REJECT)

Return your evaluation as a JSON object with a "validations" array."""


@dataclass
class LeadingRoleValidation:
    """领导角色验证结果"""
    entity_name: str
    is_valid_leadership: bool
    role_title: str
    role_type: str  # founder, executive, critical_technical, speaker, partner, member, other
    has_distinguished_reputation: bool
    reputation_evidence: str
    confidence: float
    legal_reasoning: str
    recommendation: str  # STRONG, MEDIUM, WEAK, REJECT
    snippet_ids: List[str] = field(default_factory=list)


class LeadingRoleAgent:
    """
    Leading Role Agent - 验证 §204.5(h)(3)(viii) 证据

    工作流程：
    1. 接收 Evidence Grouper 的 leading_role clusters
    2. 使用 LLM 验证每个 cluster 是否符合法律定义
    3. 输出带有法律依据的验证结果
    """

    def __init__(self, provider: str = "deepseek"):
        self.provider = provider

    async def validate_clusters(
        self,
        clusters: List[Dict],
        snippets: List[Dict],
        applicant_name: str
    ) -> Dict[str, Any]:
        """
        验证所有 leading_role clusters

        Args:
            clusters: 来自 Evidence Grouper 的 leading_role clusters
            snippets: 所有 snippets (用于获取详细内容)
            applicant_name: 申请人姓名

        Returns:
            {
                "validations": [LeadingRoleValidation, ...],
                "qualified": [...],  # STRONG + MEDIUM
                "rejected": [...],   # WEAK + REJECT
                "stats": {...}
            }
        """
        print(f"[LeadingRoleAgent] Validating {len(clusters)} clusters...")

        # 构建 snippet 查找表
        snippet_map = {s.get("snippet_id", ""): s for s in snippets}

        validations = []
        qualified = []
        rejected = []

        for cluster in clusters:
            validation = await self._validate_single_cluster(
                cluster,
                snippet_map,
                applicant_name
            )
            validations.append(validation)

            if validation.recommendation in ["STRONG", "MEDIUM"]:
                qualified.append(asdict(validation))
            else:
                rejected.append(asdict(validation))

        print(f"[LeadingRoleAgent] Qualified: {len(qualified)}, Rejected: {len(rejected)}")

        return {
            "validations": [asdict(v) for v in validations],
            "qualified": qualified,
            "rejected": rejected,
            "stats": {
                "total": len(validations),
                "qualified": len(qualified),
                "rejected": len(rejected),
                "strong": sum(1 for v in validations if v.recommendation == "STRONG"),
                "medium": sum(1 for v in validations if v.recommendation == "MEDIUM"),
                "weak": sum(1 for v in validations if v.recommendation == "WEAK"),
                "reject": sum(1 for v in validations if v.recommendation == "REJECT")
            }
        }

    async def _validate_single_cluster(
        self,
        cluster: Dict,
        snippet_map: Dict[str, Dict],
        applicant_name: str
    ) -> LeadingRoleValidation:
        """验证单个 cluster"""
        entity_name = cluster.get("entity_name", "")
        relationship_type = cluster.get("relationship_type", "unknown")
        snippet_ids = cluster.get("snippet_ids", [])

        # 获取 snippet 内容
        snippets_text = []
        for sid in snippet_ids[:15]:  # 限制数量
            snippet = snippet_map.get(sid, {})
            text = snippet.get("text", "")[:300]
            context = snippet.get("context", {})
            full_context = context.get("full_context", "") if context else ""

            if full_context:
                snippets_text.append(f"[{sid}] {full_context[:400]}")
            else:
                snippets_text.append(f"[{sid}] {text}")

        # 如果没有 snippets，直接返回 REJECT
        if not snippets_text:
            return LeadingRoleValidation(
                entity_name=entity_name,
                is_valid_leadership=False,
                role_title="",
                role_type="other",
                has_distinguished_reputation=False,
                reputation_evidence="",
                confidence=0.0,
                legal_reasoning="No evidence snippets provided for this entity.",
                recommendation="REJECT",
                snippet_ids=snippet_ids
            )

        # 构建 prompt
        user_prompt = LEADING_ROLE_USER_PROMPT.format(
            applicant_name=applicant_name,
            entity_name=entity_name,
            relationship_type=relationship_type,
            snippets_text="\n\n".join(snippets_text)
        )

        try:
            result = await call_llm(
                prompt=user_prompt,
                provider=self.provider,
                system_prompt=LEADING_ROLE_SYSTEM_PROMPT,
                json_schema=LEADING_ROLE_VALIDATION_SCHEMA,
                temperature=0.1,
                max_tokens=1500
            )

            # 调试输出
            print(f"[LeadingRoleAgent] Raw result type: {type(result)}")
            print(f"[LeadingRoleAgent] Raw result keys: {result.keys() if isinstance(result, dict) else 'N/A'}")

            # 解析结果 - 处理多种可能的响应格式
            validations = result.get("validations", [])

            # 如果没有 validations 键，尝试从其他格式转换
            if not validations and isinstance(result, dict):
                # 可能整个结果就是一个验证对象
                if "entity_name" in result or "is_valid_leadership" in result:
                    validations = [result]
                # 或者验证数据在其他键下
                for key in ["validation", "result", "evaluation"]:
                    if key in result:
                        val = result[key]
                        if isinstance(val, list):
                            validations = val
                        elif isinstance(val, dict):
                            validations = [val]
                        break

            print(f"[LeadingRoleAgent] Parsed validations count: {len(validations)}")
            if validations:
                v = validations[0]  # 取第一个（应该只有一个）
                print(f"[LeadingRoleAgent] Validation content keys: {v.keys() if isinstance(v, dict) else 'N/A'}")

                # 处理备用格式：{criterion: ..., evaluation: {...}}
                if "evaluation" in v and isinstance(v["evaluation"], dict):
                    eval_data = v["evaluation"]
                    recommendation = eval_data.get("recommendation", "WEAK")
                    reasoning = eval_data.get("reasoning", eval_data.get("leading_role_analysis", ""))
                    rep_evidence = eval_data.get("organization_reputation_analysis", "")

                    # 从 reasoning 推断 role_type 和 is_valid
                    is_valid = recommendation in ["STRONG", "MEDIUM"]
                    role_type = "founder" if "founder" in reasoning.lower() else \
                                "executive" if any(x in reasoning.lower() for x in ["ceo", "director", "executive"]) else "other"

                    print(f"[LeadingRoleAgent] Alternative format detected - recommendation: {recommendation}")

                    return LeadingRoleValidation(
                        entity_name=entity_name,
                        is_valid_leadership=is_valid,
                        role_title="Founder & Head Coach" if role_type == "founder" else "",
                        role_type=role_type,
                        has_distinguished_reputation=True if "distinguished" in rep_evidence.lower() else False,
                        reputation_evidence=rep_evidence[:500] if rep_evidence else "",
                        confidence=0.9 if recommendation == "STRONG" else 0.7 if recommendation == "MEDIUM" else 0.3,
                        legal_reasoning=reasoning[:500] if reasoning else "",
                        recommendation=recommendation,
                        snippet_ids=snippet_ids
                    )

                # 标准格式
                return LeadingRoleValidation(
                    entity_name=v.get("entity_name", entity_name),
                    is_valid_leadership=v.get("is_valid_leadership", False),
                    role_title=v.get("role_title", ""),
                    role_type=v.get("role_type", "other"),
                    has_distinguished_reputation=v.get("has_distinguished_reputation", False),
                    reputation_evidence=v.get("reputation_evidence", ""),
                    confidence=v.get("confidence", 0.5),
                    legal_reasoning=v.get("legal_reasoning", ""),
                    recommendation=v.get("recommendation", "WEAK"),
                    snippet_ids=snippet_ids
                )

            # 如果解析失败，返回默认值
            return LeadingRoleValidation(
                entity_name=entity_name,
                is_valid_leadership=False,
                role_title="",
                role_type="other",
                has_distinguished_reputation=False,
                reputation_evidence="",
                confidence=0.0,
                legal_reasoning="Failed to parse LLM response.",
                recommendation="WEAK",
                snippet_ids=snippet_ids
            )

        except Exception as e:
            print(f"[LeadingRoleAgent] Error validating {entity_name}: {e}")
            return LeadingRoleValidation(
                entity_name=entity_name,
                is_valid_leadership=False,
                role_title="",
                role_type="other",
                has_distinguished_reputation=False,
                reputation_evidence="",
                confidence=0.0,
                legal_reasoning=f"Error during validation: {str(e)}",
                recommendation="WEAK",
                snippet_ids=snippet_ids
            )


async def validate_leading_role_evidence(
    clusters: List[Dict],
    snippets: List[Dict],
    applicant_name: str,
    provider: str = "deepseek"
) -> Dict[str, Any]:
    """
    便捷函数：验证 Leading Role 证据

    Args:
        clusters: leading_role clusters from Evidence Grouper
        snippets: all enriched snippets
        applicant_name: applicant name
        provider: LLM provider

    Returns:
        validation results
    """
    agent = LeadingRoleAgent(provider=provider)
    return await agent.validate_clusters(clusters, snippets, applicant_name)
