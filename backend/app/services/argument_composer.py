"""
Argument Composer - 律师风格论点组合器

将碎片化的 snippets 组合成结构化的律师风格论点：
- Membership: 按协会分组
- Published Material: 按媒体分组
- Original Contribution: 合并成整体
- Leading Role: 按组织分组
- Awards: 按奖项分组

每个论点包含: Claim + Proof + Significance + Context + Conclusion
"""

import json
import re
from typing import Dict, List, Any, Optional
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, asdict, field


# EB-1A 法规引用
LEGAL_CITATIONS = {
    "membership": "8 C.F.R. §204.5(h)(3)(ii)",
    "published_material": "8 C.F.R. §204.5(h)(3)(iii)",
    "original_contribution": "8 C.F.R. §204.5(h)(3)(v)",
    "leading_role": "8 C.F.R. §204.5(h)(3)(viii)",
    "awards": "8 C.F.R. §204.5(h)(3)(i)",
}

# 标准的正式名称
STANDARD_FORMAL_NAMES = {
    "membership": "Membership in Associations Requiring Outstanding Achievements",
    "published_material": "Published Material in Professional/Major Trade Publications",
    "original_contribution": "Original Contributions of Major Significance",
    "leading_role": "Leading/Critical Role for Distinguished Organizations",
    "awards": "Nationally/Internationally Recognized Awards",
}


@dataclass
class EvidenceItem:
    """单条证据"""
    text: str
    exhibit_id: str
    purpose: str  # direct_proof, selectivity_proof, credibility_proof, impact_proof
    snippet_id: str = ""


@dataclass
class ComposedArgument:
    """组合后的论点"""
    title: str
    standard: str
    group_key: str  # 分组键（协会名/媒体名/组织名）
    claim: List[EvidenceItem] = field(default_factory=list)
    proof: List[EvidenceItem] = field(default_factory=list)
    significance: List[EvidenceItem] = field(default_factory=list)
    context: List[EvidenceItem] = field(default_factory=list)
    exhibits: List[str] = field(default_factory=list)
    conclusion: str = ""
    completeness: Dict[str, Any] = field(default_factory=dict)


class ArgumentComposer:
    """论点组合器"""

    def __init__(self, snippets: List[Dict], applicant_name: str = "Ms. Qu"):
        self.snippets = snippets
        self.applicant_name = applicant_name
        self.snippets_by_standard = self._group_by_standard()

    def _group_by_standard(self) -> Dict[str, List[Dict]]:
        """按标准分组"""
        grouped = defaultdict(list)
        for snp in self.snippets:
            # 只处理申请人相关的证据
            if not snp.get("is_applicant_achievement", True):
                continue
            etype = snp.get("evidence_type", "other")
            standard = self._map_to_standard(etype)
            if standard:
                grouped[standard].append(snp)
        return grouped

    def _map_to_standard(self, etype: str) -> Optional[str]:
        """证据类型映射到标准"""
        mapping = {
            "membership": "membership",
            "membership_criteria": "membership",
            "membership_evaluation": "membership",
            "peer_achievement": "membership",
            "publication": "published_material",
            "media_coverage": "published_material",
            "source_credibility": "published_material",
            "contribution": "original_contribution",
            "quantitative_impact": "original_contribution",
            "recommendation": "original_contribution",
            "peer_assessment": "original_contribution",
            "leadership": "leading_role",
            "award": "awards",
        }
        return mapping.get(etype)

    def compose_all(self) -> Dict[str, List[ComposedArgument]]:
        """组合所有标准的论点"""
        composed = {}
        for standard in ["membership", "published_material", "original_contribution", "leading_role", "awards"]:
            composed[standard] = self._compose_standard(standard)
        return composed

    def _compose_standard(self, standard: str) -> List[ComposedArgument]:
        """组合单个标准的论点"""
        snippets = self.snippets_by_standard.get(standard, [])
        if not snippets:
            return []

        if standard == "original_contribution":
            # Original Contribution: 合并成一个整体论点
            return [self._compose_single_argument(snippets, standard, "BAT Training System")]
        else:
            # 其他标准: 按实体分组
            groups = self._group_by_entity(snippets, standard)
            return [
                self._compose_single_argument(group_snippets, standard, group_key)
                for group_key, group_snippets in groups.items()
                if group_snippets
            ]

    def _group_by_entity(self, snippets: List[Dict], standard: str) -> Dict[str, List[Dict]]:
        """按核心实体分组"""
        groups = defaultdict(list)

        for snp in snippets:
            text = snp.get("text", "").lower()
            subject = snp.get("subject", "")

            if standard == "membership":
                # 按协会分组
                group_key = self._extract_association_name(text, subject)
            elif standard == "published_material":
                # 按媒体分组
                group_key = self._extract_media_name(text, snp.get("exhibit_id", ""))
            elif standard == "leading_role":
                # 按组织分组
                group_key = self._extract_organization_name(text, subject)
            elif standard == "awards":
                # 按奖项分组
                group_key = self._extract_award_name(text)
            else:
                group_key = "default"

            groups[group_key].append(snp)

        return groups

    def _extract_association_name(self, text: str, subject: str) -> str:
        """提取协会名称"""
        patterns = [
            r"shanghai fitness bodybuilding association",
            r"china weightlifting association",
            r"usa weightlifting",
            r"nsca",
            r"singapore weightlifting",
        ]
        for p in patterns:
            if re.search(p, text, re.IGNORECASE):
                return p.title().replace("Usa", "USA").replace("Nsca", "NSCA")
        return "Professional Association"

    def _extract_media_name(self, text: str, exhibit_id: str) -> str:
        """提取媒体名称"""
        media_patterns = {
            "jakarta post": "The Jakarta Post",
            "china sports daily": "China Sports Daily",
            "sixth tone": "Sixth Tone",
            "the paper": "The Paper",
        }
        for pattern, name in media_patterns.items():
            if pattern in text.lower():
                return name
        # 根据 exhibit ID 推断
        if exhibit_id.startswith("D"):
            return f"Media Coverage ({exhibit_id})"
        return "Media Publication"

    def _extract_organization_name(self, text: str, subject: str) -> str:
        """提取组织名称"""
        patterns = {
            "venus weightlifting": "Venus Weightlifting Club",
            "shanghai yiqing": "Shanghai Yiqing",
            "ishtar health": "ISHTAR Health",
            "onefit": "OneFit",
        }
        for pattern, name in patterns.items():
            if pattern in text.lower():
                return name
        if subject and "organization" not in subject.lower():
            return subject
        return "Organization"

    def _extract_award_name(self, text: str) -> str:
        """提取奖项名称"""
        patterns = [
            r"achievement award.*fitness industry",
            r"first prize",
            r"gold medal",
        ]
        for p in patterns:
            if re.search(p, text, re.IGNORECASE):
                return "Achievement Award in Fitness Industry"
        return "Award"

    def _compose_single_argument(self, snippets: List[Dict], standard: str, group_key: str) -> ComposedArgument:
        """组合单个论点"""
        # 按层级分类
        layers = {"claim": [], "proof": [], "significance": [], "context": []}
        exhibits = set()

        for snp in snippets:
            layer = snp.get("evidence_layer", "claim")
            if layer not in layers:
                layer = "claim"

            item = EvidenceItem(
                text=snp.get("text", "")[:500],
                exhibit_id=snp.get("exhibit_id", ""),
                purpose=snp.get("evidence_purpose", "direct_proof"),
                snippet_id=snp.get("snippet_id", "")
            )
            layers[layer].append(item)
            exhibits.add(snp.get("exhibit_id", ""))

        # 生成标题
        title = self._generate_title(group_key, standard)

        # 生成结论
        conclusion = self._generate_conclusion(standard, group_key)

        # 计算完整性
        completeness = {
            "has_claim": len(layers["claim"]) > 0,
            "has_proof": len(layers["proof"]) > 0,
            "has_significance": len(layers["significance"]) > 0,
            "has_context": len(layers["context"]) > 0,
            "score": self._calculate_completeness_score(layers)
        }

        return ComposedArgument(
            title=title,
            standard=standard,
            group_key=group_key,
            claim=layers["claim"],
            proof=layers["proof"],
            significance=layers["significance"],
            context=layers["context"],
            exhibits=sorted(list(exhibits)),
            conclusion=conclusion,
            completeness=completeness
        )

    def _generate_title(self, group_key: str, standard: str) -> str:
        """生成律师风格标题"""
        templates = {
            "membership": f"{self.applicant_name}'s Membership in {group_key}",
            "published_material": f"{group_key} Coverage of {self.applicant_name}",
            "original_contribution": f"{self.applicant_name}'s Original BAT Training System and Its Major Significance",
            "leading_role": f"{self.applicant_name}'s Leadership at {group_key}",
            "awards": f"{self.applicant_name}'s {group_key}",
        }
        return templates.get(standard, f"{self.applicant_name} - {group_key}")

    def _generate_conclusion(self, standard: str, group_key: str) -> str:
        """生成法律结论"""
        citation = LEGAL_CITATIONS.get(standard, "")
        conclusions = {
            "membership": f"{self.applicant_name}'s membership in {group_key} clearly meets the requirements of {citation}.",
            "published_material": f"The coverage by {group_key}, a major publication, meets the requirements of {citation}.",
            "original_contribution": f"{self.applicant_name} has made original contributions of major significance to the field, as required under {citation}.",
            "leading_role": f"{self.applicant_name} has performed a leading and critical role for {group_key}, an organization of distinguished reputation, as required under {citation}.",
            "awards": f"{self.applicant_name}'s receipt of this award meets the requirements of {citation}.",
        }
        return conclusions.get(standard, "")

    def _calculate_completeness_score(self, layers: Dict) -> int:
        """计算完整性分数"""
        score = 0
        if layers["claim"]:
            score += 30
        if layers["proof"]:
            score += 20
        if layers["significance"]:
            score += 40  # 最重要
        if layers["context"]:
            score += 10
        return score

    def generate_lawyer_output(self) -> str:
        """生成律师风格的 Markdown 输出"""
        composed = self.compose_all()
        lines = []

        lines.append("# EB-1A Petition - Evidence Summary")
        lines.append(f"## Petitioner: {self.applicant_name}")
        lines.append("")
        lines.append("---")

        for standard in ["membership", "published_material", "original_contribution", "leading_role", "awards"]:
            args = composed.get(standard, [])
            if not args:
                continue

            formal_name = STANDARD_FORMAL_NAMES.get(standard, standard)
            lines.append(f"\n## {formal_name}")
            lines.append("")

            for arg in args:
                completeness_icon = "✅" if arg.completeness.get("score", 0) >= 70 else "⚠️"
                lines.append(f"### {arg.title} {completeness_icon}")
                lines.append("")

                # Claim
                if arg.claim:
                    lines.append("**CLAIM:**")
                    for item in arg.claim[:3]:
                        lines.append(f"- {item.text[:200]}... [Exhibit {item.exhibit_id}]")
                    lines.append("")

                # Proof
                if arg.proof:
                    lines.append("**PROOF:**")
                    for item in arg.proof[:3]:
                        lines.append(f"- {item.text[:200]}... [Exhibit {item.exhibit_id}]")
                    lines.append("")

                # Significance (最重要)
                if arg.significance:
                    lines.append("**SIGNIFICANCE:** ⭐")
                    for item in arg.significance[:5]:
                        purpose_label = {
                            "selectivity_proof": "[Selectivity]",
                            "credibility_proof": "[Credibility]",
                            "impact_proof": "[Impact]"
                        }.get(item.purpose, "")
                        lines.append(f"- {purpose_label} {item.text[:200]}... [Exhibit {item.exhibit_id}]")
                    lines.append("")
                else:
                    lines.append("**SIGNIFICANCE:** ⚠️ *Missing - needs supporting evidence*")
                    lines.append("")

                # Context
                if arg.context:
                    lines.append("**CONTEXT:**")
                    for item in arg.context[:2]:
                        lines.append(f"- {item.text[:150]}... [Exhibit {item.exhibit_id}]")
                    lines.append("")

                # Conclusion
                lines.append(f"**CONCLUSION:** {arg.conclusion}")
                lines.append("")
                lines.append(f"*Exhibits: {', '.join(arg.exhibits)}*")
                lines.append("")
                lines.append("---")

        return "\n".join(lines)

    def get_statistics(self) -> Dict[str, Any]:
        """获取统计数据"""
        composed = self.compose_all()

        stats = {
            "by_standard": {},
            "total_arguments": 0,
            "with_significance": 0,
            "avg_completeness": 0
        }

        total_score = 0
        for standard, args in composed.items():
            std_stats = {
                "count": len(args),
                "with_significance": sum(1 for a in args if a.significance),
                "avg_score": sum(a.completeness.get("score", 0) for a in args) / len(args) if args else 0
            }
            stats["by_standard"][standard] = std_stats
            stats["total_arguments"] += len(args)
            stats["with_significance"] += std_stats["with_significance"]
            total_score += sum(a.completeness.get("score", 0) for a in args)

        stats["avg_completeness"] = total_score / stats["total_arguments"] if stats["total_arguments"] > 0 else 0
        return stats


def compose_project_arguments(project_id: str, applicant_name: str = "Ms. Qu") -> Dict[str, Any]:
    """组合项目论点"""
    projects_dir = Path(__file__).parent.parent.parent / "data" / "projects"
    project_dir = projects_dir / project_id

    # 加载 snippets
    snippets = []
    extraction_dir = project_dir / "extraction"
    if extraction_dir.exists():
        for f in extraction_dir.glob("*_extraction.json"):
            with open(f, 'r', encoding='utf-8') as fp:
                data = json.load(fp)
                snippets.extend(data.get("snippets", []))

    # 组合
    composer = ArgumentComposer(snippets, applicant_name)

    return {
        "composed": {k: [asdict(a) for a in v] for k, v in composer.compose_all().items()},
        "lawyer_output": composer.generate_lawyer_output(),
        "statistics": composer.get_statistics()
    }


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding='utf-8')

    result = compose_project_arguments("yaruo_qu", "Ms. Yaruo Qu")
    print(result["lawyer_output"])
    print("\n" + "=" * 60)
    print("Statistics:", json.dumps(result["statistics"], indent=2, ensure_ascii=False))
