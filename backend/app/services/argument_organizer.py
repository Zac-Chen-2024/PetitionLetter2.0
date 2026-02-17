"""
律师风格论点组织器

将提取的证据按照律师的"证据金字塔"组织成完整的论证结构：
Claim → Proof → Significance → Context
"""

import json
from typing import Dict, List, Any, Optional
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, asdict


@dataclass
class OrganizedArgument:
    """组织后的论点"""
    standard: str               # EB-1A 标准
    title: str                  # 论点标题
    claim: List[Dict]          # 声明层证据
    proof: List[Dict]          # 证明层证据
    significance: List[Dict]   # 重要性层证据
    context: List[Dict]        # 背景层证据
    strength: str              # strong/moderate/weak
    gaps: List[str]            # 缺失项


STANDARD_TITLES = {
    "membership": "Membership in Associations Requiring Outstanding Achievements",
    "published_material": "Published Material in Professional/Major Trade Publications",
    "original_contribution": "Original Contributions of Major Significance",
    "leading_role": "Leading/Critical Role for Distinguished Organizations",
    "awards": "Nationally/Internationally Recognized Awards"
}


class ArgumentOrganizer:
    """论点组织器"""

    def __init__(self, snippets: List[Dict], arguments: List[Dict]):
        self.snippets = {s["snippet_id"]: s for s in snippets}
        self.arguments = arguments
        self.arguments_by_standard = self._group_arguments()

    def _group_arguments(self) -> Dict[str, List[Dict]]:
        """按标准分组论点"""
        grouped = defaultdict(list)
        for arg in self.arguments:
            std = arg.get("standard_key", "other")
            if std:
                grouped[std].append(arg)
        return grouped

    def organize_all(self) -> Dict[str, List[OrganizedArgument]]:
        """组织所有标准的论点"""
        organized = {}
        for standard in ["membership", "published_material", "original_contribution", "leading_role", "awards"]:
            organized[standard] = self.organize_standard(standard)
        return organized

    def organize_standard(self, standard: str) -> List[OrganizedArgument]:
        """组织单个标准的论点"""
        args = self.arguments_by_standard.get(standard, [])
        if not args:
            return []

        organized = []
        for arg in args:
            org_arg = self._organize_single_argument(arg, standard)
            organized.append(org_arg)

        # 按强度排序
        organized.sort(key=lambda x: {"strong": 0, "moderate": 1, "weak": 2}.get(x.strength, 3))
        return organized

    def _organize_single_argument(self, arg: Dict, standard: str) -> OrganizedArgument:
        """组织单个论点"""
        snippet_ids = arg.get("snippet_ids", [])

        # 按层级分类 snippets
        layers = {"claim": [], "proof": [], "significance": [], "context": []}

        for sid in snippet_ids:
            snp = self.snippets.get(sid)
            if not snp:
                continue
            layer = snp.get("evidence_layer", "claim")
            layers[layer].append({
                "text": snp.get("text", "")[:300],
                "evidence_type": snp.get("evidence_type"),
                "evidence_purpose": snp.get("evidence_purpose"),
                "subject": snp.get("subject"),
                "exhibit_id": snp.get("exhibit_id")
            })

        # 评估强度
        gaps = []
        if not layers["claim"]:
            gaps.append("缺少声明层证据")
        if not layers["significance"]:
            gaps.append("缺少重要性层证据 (CRITICAL)")

        if len(gaps) == 0:
            strength = "strong"
        elif "significance" in str(gaps):
            strength = "weak"
        else:
            strength = "moderate"

        return OrganizedArgument(
            standard=standard,
            title=arg.get("title", ""),
            claim=layers["claim"],
            proof=layers["proof"],
            significance=layers["significance"],
            context=layers["context"],
            strength=strength,
            gaps=gaps
        )

    def generate_lawyer_format(self) -> str:
        """生成律师风格的论证文档"""
        organized = self.organize_all()
        lines = []

        lines.append("# EB-1A Petition - Evidence Summary")
        lines.append("=" * 60)
        lines.append("")

        for standard, args in organized.items():
            if not args:
                continue

            std_title = STANDARD_TITLES.get(standard, standard)
            lines.append(f"## {std_title}")
            lines.append("-" * 50)

            for i, arg in enumerate(args, 1):
                strength_icon = "🟢" if arg.strength == "strong" else "🟡" if arg.strength == "moderate" else "🔴"
                lines.append(f"\n### {i}. {arg.title} {strength_icon}")

                # Claim 层
                if arg.claim:
                    lines.append("\n**CLAIM (声明):**")
                    for c in arg.claim[:2]:
                        lines.append(f"- {c['text'][:150]}...")
                        lines.append(f"  [Exhibit {c.get('exhibit_id', 'N/A')}]")

                # Proof 层
                if arg.proof:
                    lines.append("\n**PROOF (证明):**")
                    for p in arg.proof[:2]:
                        lines.append(f"- {p['text'][:150]}...")

                # Significance 层 - 最重要！
                if arg.significance:
                    lines.append("\n**SIGNIFICANCE (重要性) ⭐:**")
                    for s in arg.significance:
                        purpose = s.get("evidence_purpose", "")
                        purpose_label = {
                            "selectivity_proof": "[选择性证明]",
                            "credibility_proof": "[权威性证明]",
                            "impact_proof": "[影响力证明]"
                        }.get(purpose, "")
                        lines.append(f"- {purpose_label} {s['text'][:150]}...")
                else:
                    lines.append("\n**SIGNIFICANCE (重要性) ⚠️ 缺失!**")
                    lines.append("- 需要补充: 量化数据、组织声誉证明、或其他杰出成员成就")

                # 差距
                if arg.gaps:
                    lines.append(f"\n⚠️ 差距: {', '.join(arg.gaps)}")

            lines.append("")

        return "\n".join(lines)

    def get_statistics(self) -> Dict[str, Any]:
        """获取统计数据"""
        organized = self.organize_all()

        stats = {
            "by_standard": {},
            "total_arguments": 0,
            "strength_distribution": {"strong": 0, "moderate": 0, "weak": 0},
            "significance_coverage": 0
        }

        total_with_sig = 0
        total_args = 0

        for standard, args in organized.items():
            std_stats = {
                "count": len(args),
                "strong": sum(1 for a in args if a.strength == "strong"),
                "with_significance": sum(1 for a in args if a.significance)
            }
            stats["by_standard"][standard] = std_stats

            total_args += len(args)
            total_with_sig += std_stats["with_significance"]

            for arg in args:
                stats["strength_distribution"][arg.strength] += 1

        stats["total_arguments"] = total_args
        stats["significance_coverage"] = total_with_sig / total_args if total_args > 0 else 0

        return stats


def organize_project_arguments(project_id: str) -> Dict[str, Any]:
    """组织项目的论点"""
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

    # 加载 arguments
    arguments = []
    args_file = project_dir / "arguments" / "generated_arguments.json"
    if args_file.exists():
        with open(args_file, 'r', encoding='utf-8') as fp:
            data = json.load(fp)
            arguments = data.get("arguments", [])

    # 组织
    organizer = ArgumentOrganizer(snippets, arguments)

    return {
        "organized": {k: [asdict(a) for a in v] for k, v in organizer.organize_all().items()},
        "lawyer_format": organizer.generate_lawyer_format(),
        "statistics": organizer.get_statistics()
    }


if __name__ == "__main__":
    result = organize_project_arguments("yaruo_qu")
    print(result["lawyer_format"])
    print("\n" + "=" * 60)
    print("Statistics:", json.dumps(result["statistics"], indent=2))
