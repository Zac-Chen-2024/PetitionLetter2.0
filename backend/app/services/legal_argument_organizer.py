"""
Legal Argument Organizer - LLM + 法律条例驱动的子论点组织器

核心原则：
1. LLM 理解 8 C.F.R. §204.5(h)(3) 各标准的法律要件
2. 智能选择最有说服力的证据组合
3. 自动过滤弱证据（如普通会员资格）
4. 输出数量与律师例文一致（~7-8个子论点）
"""

import json
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
import uuid

from .llm_client import call_llm
from .subargument_generator import generate_sub_arguments_for_composed, GeneratedSubArgument
from .standards_registry import get_standards_for_type


# ==================== EB-1A 法律条例定义 ====================

LEGAL_STANDARDS = {
    "awards": {
        "citation": "8 C.F.R. §204.5(h)(3)(i)",
        "name": "Nationally/Internationally Recognized Awards",
        "requirements": """
Legal requirements:
1. Awards must have national or international recognition
2. Awards must be for excellence in the field (not participation awards)
3. Must demonstrate the prestige and selectivity of the award

Argumentation structure (combine into ONE argument; sub-divide by individual award):
- Each distinct award → one sub-argument with its own evidence chain:
  1. Award name, year, and the applicant's specific honor
  2. Awarding body's authority and reputation
  3. Selection process rigor (jury composition, review methodology, duration)
  4. Competitiveness (number of nominees vs. winners, acceptance rate)
  5. Peer comparison (other distinguished recipients to show caliber)
""",
    },
    "membership": {
        "citation": "8 C.F.R. §204.5(h)(3)(ii)",
        "name": "Membership in Associations",
        "requirements": """
Legal requirements:
1. The association must require outstanding achievements for admission (not ordinary professional certification)
2. Must demonstrate the association's selectivity and distinguished reputation
3. Must show other distinguished members for peer comparison
4. Ordinary industry certifications or licenses do NOT qualify

Argumentation structure (one sub-argument per qualifying association):
- Each association → its own evidence chain:
  1. Association introduction (founding, mission, distinguished reputation)
  2. Membership criteria (what outstanding achievements are required for admission)
  3. Review/admission process (how rigorous the selection is)
  4. Notable members (peer comparison to demonstrate selectivity)
""",
    },
    "published_material": {
        "citation": "8 C.F.R. §204.5(h)(3)(iii)",
        "name": "Published Material in Major Media",
        "requirements": """
Legal requirements:
1. Media must be "major media" — demonstrate circulation, awards, influence
2. Coverage must be ABOUT the alien and the alien's work (not BY the alien)
3. Must demonstrate the media outlet's authority and professionalism

IMPORTANT: This is media coverage ABOUT the applicant, NOT articles written BY the applicant.
Articles authored by the applicant belong under Scholarly Articles (vi).

Argumentation structure (one sub-argument per media coverage):
- Each media report → its own evidence chain:
  1. Article title, publication date, and summary of coverage about the applicant
  2. Media outlet's authority and reach (circulation, awards, history, intended audience)
  3. Scope of the coverage (national/international reach, depth of reporting)
""",
    },
    "judging": {
        "citation": "8 C.F.R. §204.5(h)(3)(iv)",
        "name": "Judging the Work of Others",
        "requirements": """
Legal requirements:
1. The applicant participated individually or as part of a panel in judging the work of others in the field
2. Judging role must be based on professional expertise (invited, not obligatory)
3. Must demonstrate the authority of the judging activity (journal peer review, grant review, competition judging, etc.)

Argumentation structure (combine into ONE argument; sub-divide by judging role):
- Each judging appointment → its own evidence chain:
  1. Official role/title and appointing organization
  2. Organization's prestige and authority in the field
  3. Scope and scale of the judging process (submission count, jury size, review rounds)
  4. The applicant's decision-making weight or influence
  5. Other distinguished co-judges or panelists (peer comparison)
""",
    },
    "original_contribution": {
        "citation": "8 C.F.R. §204.5(h)(3)(v)",
        "name": "Original Contributions of Major Significance",
        "requirements": """
Legal requirements:
1. Contribution must be original
2. Contribution must be of major significance to the field
3. Requires quantified impact evidence (data, adoption rate, commercial success)
4. Requires independent expert recommendation letters

Argumentation structure (combine into ONE comprehensive argument; sub-divide by distinct contribution):
- Each original contribution → its own evidence chain:
  1. Description of the original work (invention, methodology, framework, product)
  2. Quantified impact (adoption metrics, user count, revenue, citations)
  3. Independent expert endorsements (recommendation letters with specific praise)
  4. Institutional or industry adoption (organizations, government programs using the work)
""",
    },
    "scholarly_articles": {
        "citation": "8 C.F.R. §204.5(h)(3)(vi)",
        "name": "Authorship of Scholarly Articles",
        "requirements": """
Legal requirements:
1. The applicant is the author of scholarly articles in professional or major trade publications or other major media
2. Published in professional journals or major media outlets
3. Must demonstrate the publication's impact (citation count, journal ranking, field influence)

IMPORTANT: This is articles/books authored BY the applicant.
This is DIFFERENT from Published Material (iii), which is media coverage ABOUT the applicant.

Argumentation structure (combine into ONE argument; sub-divide by publication):
- Each publication → its own evidence chain:
  1. Article/book title, year, and authorship role
  2. Publication venue prestige (impact factor, ranking, editorial standards)
  3. Research contribution (what is novel or significant)
  4. Citation data and impact metrics (total citations, field percentile, cross-disciplinary influence)
""",
    },
    "display": {
        "citation": "8 C.F.R. §204.5(h)(3)(vii)",
        "name": "Display of Work at Exhibitions",
        "requirements": """
Legal requirements:
1. The applicant's work was displayed at artistic exhibitions or showcases
2. The exhibition must have professional standing and recognition
3. Applies to visual arts, performing arts, design, etc.

Argumentation structure:
- Exhibition/showcase introduction
- Exhibition's prestige and influence
- Form of display and reception of the applicant's work
""",
    },
    "leading_role": {
        "citation": "8 C.F.R. §204.5(h)(3)(viii)",
        "name": "Leading/Critical Role for Distinguished Organizations",
        "requirements": """
Legal requirements:
1. The role must be leading or critical
2. The organization must have a distinguished reputation
3. Must demonstrate the applicant's decision-making authority and influence

Argumentation structure (one sub-argument per organization, select top 2-3):
- Each organization → two-tier evidence chain:
  Tier 1 — Organization's distinguished reputation (argued independently):
    1. History, scale, rankings, and industry recognition
    2. Notable achievements, partnerships, or awards
  Tier 2 — Applicant's leading/critical role within it:
    1. Title, appointment, scope of responsibilities
    2. Decision-making authority and specific achievements
    3. Testimonials or endorsements from colleagues/superiors
""",
    },
    "high_salary": {
        "citation": "8 C.F.R. §204.5(h)(3)(ix)",
        "name": "High Salary or Remuneration",
        "requirements": """
Legal requirements:
1. Salary must be significantly higher than others in the field
2. Must provide industry salary comparison data
3. Can include wages, bonuses, royalties, consulting fees, or any form of remuneration

Argumentation structure (single unified argument, typically no sub-division needed):
  1. Applicant's compensation data (base salary, bonuses, other remuneration) with official documentation
  2. Industry benchmark from authoritative third-party source (government statistics, salary surveys)
  3. Comparative ratio analysis (how many times above the average)
  4. Additional income streams if applicable (consulting, royalties, speaking fees)
""",
    },
    "commercial_success": {
        "citation": "8 C.F.R. §204.5(h)(3)(x)",
        "name": "Commercial Success in the Performing Arts",
        "requirements": """
Legal requirements:
1. Applies to the performing arts field
2. Must show box office revenue, record sales, ratings, or similar commercial data
3. Commercial success must reach a significant level in the industry

Argumentation structure:
- Commercial data (box office, sales, ratings, etc.)
- Industry benchmark comparison
- Media or industry recognition of commercial success
""",
    },
    "overall_merits": {
        "citation": "8 C.F.R. §204.5(h)(2) & Kazarian v. USCIS, 596 F.3d 1115 (9th Cir. 2010)",
        "name": "Final Merits Determination — Overall Merits",
        "requirements": """
Legal framework (Kazarian Step 2):
After demonstrating eligibility under at least three of the ten criteria,
the totality of evidence must demonstrate sustained national or international acclaim
and that the beneficiary is among the small percentage at the very top of the field.

Argumentation structure:
- Totality declaration referencing all established criteria
- Cross-criteria synthesis of supplemental evidence by theme
- Expert testimonials and recognition spanning multiple criteria
- Comprehensive conclusion tying all evidence to sustained acclaim
""",
    },
}


# ==================== Prompt Templates ====================

# ==================== NIW 法律条例定义 ====================

NIW_LEGAL_STANDARDS = {
    "prong1_merit": {
        "citation": "Matter of Dhanasar, 26 I&N Dec. 884, 889-890 (AAO 2016), Prong 1",
        "name": "Substantial Merit & National Importance",
        "requirements": """
Legal standard (Matter of Dhanasar, 26 I&N Dec. 884, 889-890):

"The first prong, substantial merit and national importance, focuses on the specific
endeavor that the foreign national proposes to undertake. The term 'endeavor' is more
specific than the general occupation... [W]e focus on what the person proposes to work
on rather than the general occupation."

"The endeavor's merit may be demonstrated in a range of areas such as business,
entrepreneurialism, science, technology, culture, health, or education. The merit of
a proposed endeavor may be demonstrated by, among other things, showing potential
prospective impact of the endeavor."

National importance — geographic scope:
"We understand 'national importance' more broadly... [The term] does not require that
the endeavor have national or global reach. We look instead at whether the endeavor
has 'national' ramifications — i.e., the potential to substantially impact or influence
work or activity extending well beyond a particular locality."

Argumentation structure:
1. Define the proposed endeavor specifically (research direction, methodology, product, business plan)
2. Substantial merit: the endeavor's value (advances the field, solves an important problem, creates economic value)
3. National importance: ramifications beyond a particular locality (policy alignment, field-wide adoption potential, societal benefit)
4. Supporting evidence: expert recommendations confirming significance, quantitative impact data, policy/industry alignment
""",
    },
    "prong2_positioned": {
        "citation": "Matter of Dhanasar, 26 I&N Dec. 884, 890 (AAO 2016), Prong 2",
        "name": "Well Positioned to Advance the Endeavor",
        "requirements": """
Legal standard (Matter of Dhanasar, 26 I&N Dec. 884, 890):

"Under the second prong, petitioners must demonstrate that the foreign nationals are
well positioned to advance their proposed endeavor. In determining whether petitioners
have met this prong, we consider factors including, but not limited to: the individual's
education, skills, knowledge and record of success in related or similar efforts; a model
or plan for future activities; any progress towards achieving the proposed endeavor; and
the interest of potential customers, users, investors, or other relevant entities or
individuals."

Key factors (non-exhaustive):
- Education, skills, knowledge
- Record of success in related or similar efforts
- A model or plan for future activities
- Progress towards achieving the proposed endeavor
- Interest of potential customers, users, investors, or other relevant entities

Argumentation structure:
1. Education and professional qualifications (degrees, certifications, specialized training)
2. Track record of success: publications, citations, awards, industry recognition, quantified achievements
3. Expert endorsements: recommendation letters from authorities confirming qualifications
4. Concrete plan and progress: current position, ongoing projects, measurable milestones
5. External validation: customer adoption, investor interest, institutional partnerships
""",
    },
    "prong3_balance": {
        "citation": "Matter of Dhanasar, 26 I&N Dec. 884, 890-891 (AAO 2016), Prong 3",
        "name": "Balance of Equities Favors Waiver",
        "requirements": """
Legal standard (Matter of Dhanasar, 26 I&N Dec. 884, 890-891):

"The third prong requires the petitioner to demonstrate that, on balance, it would be
beneficial to the United States to waive the requirements of a job offer, and thus of
a labor certification."

"In performing this analysis, USCIS may evaluate factors such as: whether, in light of
the nature of the foreign national's qualifications or proposed endeavor, it would be
impractical either for the foreign national to secure a job offer or for the petitioner
to obtain a labor certification; whether, even assuming that other qualified U.S. workers
are available, the United States would still benefit from the foreign national's
contributions; and whether the national interest in the foreign national's contributions
is sufficiently urgent to warrant forgoing the labor certification process."

"In evaluating the third prong, including whether the waiver would be in the national
interest, USCIS may consider, as one factor among others, the degree to which other
evidence of record — including evidence submitted to meet other prongs — supports the
finding that the foreign national's entry will serve the national interest."

Argumentation structure:
1. Impracticality of labor certification: work transcends conventional employer-employee relationships
2. National benefit despite available U.S. workers: unique qualifications, irreplaceable expertise
3. Benefits beyond a single employer: field-wide impact, public interest, multi-sector applications
4. Urgency: time-sensitive national priorities, policy alignment, critical workforce shortages
5. Explicit balancing: totality of evidence from all three prongs supports waiver
""",
    },
}


# ==================== Prompt Templates ====================

ORGANIZE_SYSTEM_PROMPT = """You are an expert EB-1A immigration attorney with deep knowledge of 8 C.F.R. §204.5(h)(3).

Your task is to organize evidence snippets into powerful legal arguments,
following the exact structure that immigration lawyers use in petition letters.

KEY PRINCIPLES:
1. You MUST create at least one argument for EVERY standard that has evidence snippets provided below
2. Each argument must directly address the legal requirements of its standard
3. Filter out weak evidence (e.g., ordinary professional certifications for Membership)
4. Combine related evidence into cohesive arguments within each standard
5. Follow the argumentation structure specified for each standard
6. CRITICAL DISTINCTION — Published Material (iii) vs Scholarly Articles (vi):
   - (iii) Published Material = media coverage ABOUT the alien by others
   - (vi) Scholarly Articles = academic papers/articles authored BY the alien
   These are completely different criteria. Never confuse them.

OUTPUT LANGUAGE: ALL output must be in English. Do NOT use Chinese or any other language."""

ORGANIZE_USER_PROMPT = """## EVIDENCE SUMMARY

The following {standards_with_evidence_count} EB-1A criteria have supporting evidence.
You MUST create at least one argument for EACH of them:

{evidence_summary}

## Legal Standards and Requirements (only those with evidence)

{standards_text}

## Evidence Snippets by Standard

{snippets_by_standard}

## Task

Create arguments for ALL {standards_with_evidence_count} standards listed above. Do NOT skip any.

Per-standard rules:
- Awards (i): Combine into ONE argument containing all awards
- Membership (ii): One argument per qualifying association (filter ordinary certifications)
- Published Material (iii): Media ABOUT the alien — one argument per major media outlet
- Judging (iv): Combine all judging roles into ONE argument
- Original Contribution (v): Combine ALL into ONE comprehensive argument
- Scholarly Articles (vi): Combine into ONE argument — articles authored BY the alien
- Leading Role (viii): One argument per distinguished organization (select top 2-3)
- High Salary (ix): ONE argument — only if significantly above field average

The "standard" field MUST exactly match one of: {valid_standard_keys}

Return JSON:
{{
  "arguments": [
    {{
      "id": "arg-001",
      "standard": "membership",
      "title": "[Applicant]'s Membership in [Association Name]",
      "rationale": "Why this argument is strong",
      "snippet_ids": ["snp-001", "snp-002"],
      "evidence_strength": "strong|medium|weak"
    }}
  ],
  "filtered_out": [
    {{
      "snippet_ids": ["snp-xxx"],
      "reason": "Ordinary certification, does not meet membership requirements"
    }}
  ],
  "summary": {{
    "total_arguments": 7,
    "by_standard": {{"membership": 1, "scholarly_articles": 1, "judging": 1}}
  }}
}}"""


NIW_ORGANIZE_SYSTEM_PROMPT = """You are an expert NIW (National Interest Waiver) immigration attorney with deep knowledge of Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016).

Your task is to organize evidence snippets into powerful legal arguments under the Dhanasar three-prong framework.

KEY PRINCIPLES:
1. Each argument must directly address one of the three Dhanasar prongs
2. Prong 1 (Substantial Merit & National Importance): Focus on the proposed endeavor's value
3. Prong 2 (Well Positioned): Focus on qualifications, track record, and plans
4. Prong 3 (Balance): Focus on why waiving labor certification benefits the US
5. Combine related evidence into cohesive, well-supported arguments

OUTPUT LANGUAGE: Use English for argument titles (following lawyer style), Chinese for internal notes."""


NIW_ORGANIZE_USER_PROMPT = """## EVIDENCE SUMMARY

{standards_with_evidence_count} prongs have supporting evidence:

{evidence_summary}

## Dhanasar Three-Prong Framework

{standards_text}

## Evidence Snippets by Prong

{snippets_by_standard}

## Task

Organize these snippets into powerful legal arguments under the Dhanasar framework.
Aim for 3-6 arguments total, with at least one per prong.
Valid standard keys: {valid_standard_keys}

Return JSON:
{{
  "arguments": [
    {{
      "id": "arg-001",
      "standard": "prong1_merit",
      "title": "Applicant's Research in X Addresses National Need for Y",
      "rationale": "Why this argument is strong",
      "snippet_ids": ["snp-001", "snp-002"],
      "evidence_strength": "strong|medium|weak"
    }}
  ],
  "filtered_out": [
    {{
      "snippet_ids": ["snp-xxx"],
      "reason": "Not relevant to any Dhanasar prong"
    }}
  ],
  "summary": {{
    "total_arguments": 5,
    "by_standard": {{"prong1_merit": 2, "prong2_positioned": 2, "prong3_balance": 1}}
  }}
}}"""


# ==================== NIW v2 Prompts ====================

NIW_CLASSIFY_OTHER_SYSTEM_PROMPT = """You are an expert NIW immigration attorney. Classify each evidence snippet
into the most appropriate Dhanasar prong based on its content.
ALL output must be in English."""

NIW_CLASSIFY_OTHER_USER_PROMPT = """Classify each of the following evidence snippets into the most appropriate
Dhanasar prong for an NIW petition.

Prong definitions:
- prong1_merit: The proposed endeavor has substantial merit and national importance
  (e.g., endeavor descriptions, field impact, national importance evidence, contributions)
- prong2_positioned: The applicant is well positioned to advance the endeavor
  (e.g., education, work experience, publications, awards, certifications, expert endorsements)
- prong3_balance: On balance, waiving labor certification benefits the US
  (e.g., national benefit arguments, beyond-employer impact, urgency)
- skip: Not relevant to any prong (e.g., pure formatting, boilerplate, table of contents)

## Snippets to classify

{snippets_text}

Return JSON:
{{
  "classifications": [
    {{"snippet_id": "snp-xxx", "prong": "prong1_merit"}},
    {{"snippet_id": "snp-yyy", "prong": "prong2_positioned"}},
    {{"snippet_id": "snp-zzz", "prong": "skip"}}
  ]
}}

RULES:
1. Every snippet MUST appear exactly once in the output
2. Prefer prong1_merit or prong2_positioned over skip — only skip truly irrelevant content
3. Recommendation letters discussing the applicant's qualifications → prong2_positioned
4. Recommendation letters discussing the endeavor's importance → prong1_merit
5. General professional achievements without clear prong fit → prong2_positioned"""

NIW_PRONG_ORGANIZE_SYSTEM_PROMPT = """You are an expert NIW immigration attorney organizing evidence for one prong
of the Dhanasar three-prong test.
Your task: organize ALL provided evidence snippets into coherent sub-arguments.
ALL output must be in English."""

NIW_PRONG_ORGANIZE_USER_PROMPT = """## Prong: {prong_name}
## Legal Standard: {prong_citation}
## Applicant: {applicant_name}

{prong_description}

## Evidence Snippets ({snippet_count} total)

{snippets_text}

## Task

Organize ALL the above snippets into coherent sub-arguments for this prong.

RULES:
1. Each sub-argument should be a distinct legal point with a clear theme
2. Cross-reference evidence from different exhibits when they support the same point
3. Recommendation letter content should be distributed to the relevant sub-argument topics
   (do NOT create a separate "recommendation letters" sub-argument)
4. EVERY snippet must be assigned to exactly one sub-argument — 100% coverage required
5. Aim for {target_subargs} sub-arguments depending on evidence volume
6. Title should be a concise legal argument heading (e.g., "Applicant's Research Addresses Critical National Need in X")
7. Purpose should explain what legal point this sub-argument establishes
8. Relationship should be 3-8 words explaining how it supports the prong

Return JSON:
{{
  "sub_arguments": [
    {{
      "title": "Applicant's Research Addresses Critical Need in Renewable Energy",
      "claim": "Brief statement of the legal claim this sub-argument makes",
      "purpose": "Establishes that the applicant's proposed endeavor in X has substantial merit because...",
      "relationship": "Demonstrates substantial merit of endeavor",
      "snippet_ids": ["S1", "S3", "S7", "S12"],
      "reasoning": "These snippets collectively show... grouped because..."
    }}
  ]
}}"""


# ==================== L-1A 法律条例定义 ====================

L1A_LEGAL_STANDARDS = {
    "qualifying_relationship": {
        "citation": "INA §101(a)(15)(L); 8 CFR §214.2(l)(1)(ii)",
        "name": "Qualifying Corporate Relationship",
        "requirements": """
Legal requirements:
1. A qualifying relationship (parent, subsidiary, branch, or affiliate) must exist between the foreign and U.S. entities
2. Ownership and control must be documented (e.g., majority shareholding, corporate registration, tax filings)
3. Both entities must have sufficient physical premises

Argumentation structure (single unified argument):
  1. U.S. entity incorporation and registration details
  2. Ownership chain — share transfer, percentage held, documentation (stock certificates, IRS Schedule G)
  3. Physical premises — lease terms, square footage, office/warehouse photos
  4. Parent company investment — capital transfer amount, bank statements
""",
    },
    "doing_business": {
        "citation": "8 CFR §214.2(l)(1)(ii)(H)",
        "name": "Active Business Operations",
        "requirements": """
Legal requirements:
1. Both the U.S. and foreign entities must be doing business (regular, systematic, continuous provision of goods and/or services)
2. Mere presence of an agent or office is not sufficient

Argumentation structure (combine into ONE argument):
  1. U.S. entity's nature of business, product lines, and service offerings
  2. Financial performance — revenue, tax returns, bank statements
  3. Business plan — projected growth, hiring plan, financial targets
  4. Customer/partner relationships — contracts, invoices, purchase orders
  5. Parent company operations — revenue, departments, client base, geographic reach
""",
    },
    "executive_capacity": {
        "citation": "INA §101(a)(44); 8 CFR §214.2(l)(1)(ii)(B)-(C)",
        "name": "Executive/Managerial Capacity in the U.S.",
        "requirements": """
Legal requirements:
1. The beneficiary will serve in an executive or managerial capacity
2. Must show the organizational structure supports an executive role
3. Must describe specific duties with time allocation percentages
4. Must show subordinate managers/professionals handle day-to-day operations

Argumentation structure (single unified argument):
  1. Organizational chart showing reporting hierarchy
  2. Executive duties with percentage time allocation (5 segments)
  3. Direct subordinates — names, titles, qualifications, specific duties
  4. How subordinates alleviate the beneficiary from routine operational tasks
""",
    },
    "qualifying_employment": {
        "citation": "8 CFR §214.2(l)(1)(ii)(A)",
        "name": "Qualifying Employment Abroad",
        "requirements": """
Legal requirements:
1. The beneficiary must have been employed in an executive or managerial capacity abroad for at least one continuous year within the three years preceding the petition
2. Must demonstrate the beneficiary's qualifications and achievements

Argumentation structure (single unified argument):
  1. Beneficiary's educational background and relevant degrees
  2. Employment history — positions, dates, executive duties at the foreign entity
  3. Specific achievements — contracts signed, revenue growth, partnerships established
  4. Subordinate management — departments supervised, managerial staff credentials
  5. Evidence of executive decision-making authority
""",
    },
}


L1A_ORGANIZE_SYSTEM_PROMPT = """You are an expert L-1A immigration attorney with deep knowledge of INA §101(a)(15)(L) and 8 CFR §214.2(l).

Your task is to organize evidence snippets into powerful legal arguments for an L-1A intracompany transferee petition (executive/managerial capacity).

KEY PRINCIPLES:
1. You MUST create at least one argument for EVERY standard that has evidence snippets
2. Each argument must directly address the legal requirements of its standard
3. Combine related evidence into cohesive arguments within each standard
4. Follow the argumentation structure specified for each standard
5. Focus on corporate relationship, business operations, executive capacity, and qualifying employment abroad

OUTPUT LANGUAGE: ALL output must be in English. Do NOT use Chinese or any other language."""


L1A_ORGANIZE_USER_PROMPT = """## EVIDENCE SUMMARY

The following {standards_with_evidence_count} L-1A standards have supporting evidence.
You MUST create at least one argument for EACH of them:

{evidence_summary}

## Legal Standards and Requirements (only those with evidence)

{standards_text}

## Evidence Snippets by Standard

{snippets_by_standard}

## Task

Create arguments for ALL {standards_with_evidence_count} standards listed above. Do NOT skip any.

Per-standard rules:
- Qualifying Relationship: ONE unified argument covering ownership, premises, and investment
- Doing Business: ONE argument covering both U.S. and foreign entity operations
- Executive Capacity: ONE argument with org chart, duties, and subordinate management
- Qualifying Employment: ONE argument covering background, employment history, and achievements

The "standard" field MUST exactly match one of: {valid_standard_keys}

Return JSON:
{{
  "arguments": [
    {{
      "id": "arg-001",
      "standard": "qualifying_relationship",
      "title": "Qualifying Relationship Between [Foreign Co.] and [U.S. Co.]",
      "rationale": "Why this argument is strong",
      "snippet_ids": ["snp-001", "snp-002"],
      "evidence_strength": "strong|medium|weak"
    }}
  ],
  "filtered_out": [
    {{
      "snippet_ids": ["snp-xxx"],
      "reason": "Not relevant to any L-1A standard"
    }}
  ],
  "summary": {{
    "total_arguments": 4,
    "by_standard": {{"qualifying_relationship": 1, "doing_business": 1, "executive_capacity": 1, "qualifying_employment": 1}}
  }}
}}"""


# ==================== L-1A snippet grouping ====================

L1A_EVIDENCE_TYPE_MAPPING = {
    # Qualifying Relationship
    "corporate_structure": "qualifying_relationship",
    "ownership": "qualifying_relationship",
    "share_transfer": "qualifying_relationship",
    "physical_premises": "qualifying_relationship",
    "investment": "qualifying_relationship",
    "incorporation": "qualifying_relationship",
    # Doing Business
    "business_plan": "doing_business",
    "financial_performance": "doing_business",
    "revenue": "doing_business",
    "customer_relationship": "doing_business",
    "transaction_evidence": "doing_business",
    "parent_company_info": "doing_business",
    "partnership": "doing_business",
    # Executive Capacity
    "org_chart": "executive_capacity",
    "executive_duties": "executive_capacity",
    "subordinate_credentials": "executive_capacity",
    "time_allocation": "executive_capacity",
    # Qualifying Employment
    "employment_history": "qualifying_employment",
    "education": "qualifying_employment",
    "achievement": "qualifying_employment",
    "contract_execution": "qualifying_employment",
    # Shared types that may appear
    "leadership": "executive_capacity",
    "recommendation": "qualifying_employment",
    "award": "qualifying_employment",
    "quantitative_impact": "doing_business",
    "media_coverage": "doing_business",
}


# ==================== NIW snippet grouping ====================

NIW_EVIDENCE_TYPE_MAPPING = {
    # NIW-specific extraction types (from NIW extraction prompt)
    "endeavor_description": "prong1_merit",
    "field_impact": "prong1_merit",
    "national_importance": "prong1_merit",
    "merit_evidence": "prong1_merit",
    "education": "prong2_positioned",
    "work_experience": "prong2_positioned",
    "citation_metrics": "prong2_positioned",
    "research_project": "prong2_positioned",
    "waiver_justification": "prong3_balance",
    "national_benefit": "prong3_balance",
    "beyond_employer": "prong3_balance",
    "urgency": "prong3_balance",
    # Shared types (from both EB-1A and NIW extraction)
    "contribution": "prong1_merit",
    "quantitative_impact": "prong1_merit",
    "recommendation": "prong2_positioned",
    "leadership": "prong2_positioned",
    "award": "prong2_positioned",
    "membership": "prong2_positioned",
    "publication": "prong2_positioned",
    "media_coverage": "prong1_merit",
    "certification": "prong2_positioned",
    "citation_impact": "prong2_positioned",
}


@dataclass
class LegalArgument:
    """法律论点数据结构"""
    id: str
    standard: str
    title: str
    rationale: str
    snippet_ids: List[str]
    evidence_strength: str
    sub_argument_ids: List[str] = None
    subject: str = "the applicant"
    confidence: float = 0.9
    is_ai_generated: bool = True
    created_at: str = ""

    def __post_init__(self):
        if self.sub_argument_ids is None:
            self.sub_argument_ids = []
        if not self.created_at:
            self.created_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self):
        """转换为前端兼容的字典格式"""
        return {
            "id": self.id,
            "standard": self.standard,
            "standard_key": self.standard,  # 前端需要 standard_key
            "title": self.title,
            "rationale": self.rationale,
            "snippet_ids": self.snippet_ids,
            "evidence_strength": self.evidence_strength,
            "sub_argument_ids": self.sub_argument_ids,
            "subject": self.subject,
            "confidence": self.confidence,
            "is_ai_generated": self.is_ai_generated,
            "created_at": self.created_at,
        }


async def organize_arguments_with_legal_framework(
    snippets: List[Dict],
    applicant_name: str = "the applicant",
    provider: str = "deepseek",
    project_type: str = "EB-1A",
    project_id: str = None
) -> Tuple[List[LegalArgument], List[Dict]]:
    """
    使用 LLM + 法律条例组织子论点

    Args:
        snippets: 所有提取的 snippets
        applicant_name: 申请人姓名
        provider: LLM provider
        project_type: "EB-1A" or "NIW"
        project_id: 项目 ID（用于保存 top-down pickup 中间结果）

    Returns:
        (arguments, filtered_snippets)
    """
    print(f"[LegalOrganizer] Organizing {len(snippets)} snippets with {project_type} legal framework...")

    # Select standards and prompts based on project type
    if project_type == "NIW":
        legal_stds = NIW_LEGAL_STANDARDS
        system_prompt = NIW_ORGANIZE_SYSTEM_PROMPT
        user_prompt_template = NIW_ORGANIZE_USER_PROMPT
        evidence_mapping = NIW_EVIDENCE_TYPE_MAPPING
    elif project_type == "L-1A":
        legal_stds = L1A_LEGAL_STANDARDS
        system_prompt = L1A_ORGANIZE_SYSTEM_PROMPT
        user_prompt_template = L1A_ORGANIZE_USER_PROMPT
        evidence_mapping = L1A_EVIDENCE_TYPE_MAPPING
    else:
        legal_stds = LEGAL_STANDARDS
        system_prompt = ORGANIZE_SYSTEM_PROMPT
        user_prompt_template = ORGANIZE_USER_PROMPT
        evidence_mapping = None  # uses default _group_snippets_by_standard

    # 按 standard 分组 snippets
    if project_type == "EB-1A":
        snippets_by_std = await _group_snippets_by_standard_topdown(
            snippets, legal_stds, provider, project_id=project_id
        )
    else:
        snippets_by_std = _group_snippets_by_standard(snippets, legal_stds, evidence_mapping)

    # 构建 prompt — only include standards that have evidence
    standards_with_evidence = {k: v for k, v in snippets_by_std.items() if v}
    standards_text = _format_standards_text(legal_stds, only_keys=set(standards_with_evidence.keys()))
    snippets_text = _format_snippets_by_standard(snippets_by_std, applicant_name, legal_stds)

    # Build evidence summary (explicit list at top of prompt)
    evidence_summary_lines = []
    for std_key, std_snps in standards_with_evidence.items():
        std_info = legal_stds.get(std_key, {})
        evidence_summary_lines.append(
            f"- **{std_info.get('name', std_key)}** ({std_info.get('citation', '')}) — {len(std_snps)} snippets → standard key: \"{std_key}\""
        )
    evidence_summary = "\n".join(evidence_summary_lines)

    # Build valid standard keys for the prompt
    valid_keys = ", ".join(f'"{k}"' for k in legal_stds.keys())

    user_prompt = user_prompt_template.format(
        standards_text=standards_text,
        snippet_count=len(snippets),
        snippets_by_standard=snippets_text,
        valid_standard_keys=valid_keys,
        standards_with_evidence_count=len(standards_with_evidence),
        evidence_summary=evidence_summary,
    )

    try:
        result = await call_llm(
            prompt=user_prompt,
            provider=provider,
            system_prompt=system_prompt,
            temperature=0.1,
            max_tokens=8000
        )

        raw_arguments = result.get('arguments', [])
        filtered_out = result.get('filtered_out', [])
        summary = result.get('summary', {})

        print(f"[LegalOrganizer] LLM organized into {len(raw_arguments)} arguments")
        print(f"[LegalOrganizer] Summary: {summary}")

        # 转换为 LegalArgument
        arguments = []
        for raw_arg in raw_arguments:
            arg = LegalArgument(
                id=f"arg-{uuid.uuid4().hex[:8]}",  # Always use UUID to prevent ID collisions across standards
                standard=raw_arg.get('standard', ''),
                title=raw_arg.get('title', ''),
                rationale=raw_arg.get('rationale', ''),
                snippet_ids=raw_arg.get('snippet_ids', []),
                evidence_strength=raw_arg.get('evidence_strength', 'medium'),
                subject=applicant_name,
            )
            arguments.append(arg)

        # Post-processing: ensure every standard with evidence gets at least one argument.
        # LLMs often ignore less common standards (judging, scholarly_articles, etc.)
        # Normalize standard keys to handle plural/singular variants
        _STANDARD_ALIASES = {
            "original_contributions": "original_contribution",
            "scholarly_article": "scholarly_articles",
            "high_salaries": "high_salary",
        }
        covered_standards = set()
        for arg in arguments:
            canonical = _STANDARD_ALIASES.get(arg.standard, arg.standard)
            covered_standards.add(canonical)
            covered_standards.add(arg.standard)  # also add the raw form

        print(f"[LegalOrganizer] Covered standards: {covered_standards}")
        stds_with_evidence = [k for k, v in snippets_by_std.items() if v]
        print(f"[LegalOrganizer] Standards with evidence: {stds_with_evidence}")

        arg_counter = len(arguments)
        for std_key, std_snippets in snippets_by_std.items():
            if not std_snippets:
                continue
            if std_key in covered_standards:
                continue
            print(f"[LegalOrganizer] FALLBACK: '{std_key}' has {len(std_snippets)} snippets but no LLM argument")
            # This standard has evidence but no LLM argument — create a fallback
            arg_counter += 1
            std_info = legal_stds.get(std_key, {})
            snippet_ids = [s.get('snippet_id', s.get('id', '')) for s in std_snippets]
            fallback_arg = LegalArgument(
                id=f"arg-{arg_counter:03d}",
                standard=std_key,
                title=f"{applicant_name}'s {std_info.get('name', std_key)}",
                rationale=f"Auto-generated fallback: LLM did not create an argument for {std_key} despite {len(std_snippets)} supporting snippets",
                snippet_ids=snippet_ids,
                evidence_strength="medium",
                subject=applicant_name,
            )
            arguments.append(fallback_arg)
            print(f"[LegalOrganizer] Added fallback argument for '{std_key}' with {len(snippet_ids)} snippets")

        return arguments, filtered_out

    except Exception as e:
        print(f"[LegalOrganizer] Error: {e}")
        raise


# Default EB-1A evidence type mapping
# Maps extraction evidence_type → LEGAL_STANDARDS key
_EB1A_EVIDENCE_TYPE_MAPPING = {
    # (i) Awards
    "award": "awards",
    # (ii) Membership
    "membership": "membership",
    "membership_criteria": "membership",
    "membership_evaluation": "membership",
    "peer_achievement": "membership",
    "selectivity_proof": "membership",
    # (iii) Published Material — media/reports ABOUT the alien
    "media_coverage": "published_material",
    "source_credibility": "published_material",
    # (iv) Judging
    "judging": "judging",
    "peer_assessment": "judging",
    "invitation": "judging",
    # (v) Original Contribution
    "contribution": "original_contribution",
    "quantitative_impact": "original_contribution",
    "recommendation": "original_contribution",
    "impact_proof": "original_contribution",
    "scientific_research_project": "original_contribution",
    # (vi) Scholarly Articles — authored BY the alien
    "publication": "scholarly_articles",
    "scholarly_article": "scholarly_articles",
    "authorship": "scholarly_articles",
    # (viii) Leading/Critical Role
    "leadership": "leading_role",
    "organization": "leading_role",
    # (vii) Display/Exhibition
    "exhibition": "display",
    "display": "display",
    # (ix) High Salary
    "salary": "high_salary",
    "compensation": "high_salary",
    "salary_benchmark": "high_salary",
    "high_salary": "high_salary",
    # (x) Commercial Success
    "commercial": "commercial_success",
    "commercial_success": "commercial_success",
    "box_office": "commercial_success",
    "sales": "commercial_success",
}


# Per-standard pickup criteria for top-down evidence selection
_TOPDOWN_PICKUP_CRITERIA = {
    "awards": {
        "include_direct": [
            "Snippets where subject IS the applicant AND describes a specific award/prize received",
            "Award name, year, and the applicant's specific honor",
        ],
        "include_supporting": [
            "Awarding body's background, authority, and reputation",
            "Selection process details: jury, methodology, acceptance rate",
            "Other distinguished recipients of the SAME award (peer comparison)",
        ],
        "exclude": [
            "Certifications earned by passing an exam — the regulation requires 'prizes or awards for excellence', not test-based credentials",
            "Awards received by other people for DIFFERENT awards (only same-award recipients are relevant as peer comparison)",
        ],
        "subject_rule": "Subject must be the applicant OR the awarding organization OR a peer comparison recipient of the SAME award",
    },
    "membership": {
        "include_direct": [
            "Snippets about the applicant's membership or election into an association",
            "Applicant's membership application, admission, or election records",
        ],
        "include_supporting": [
            "Association's founding, history, mission, and distinguished reputation",
            "Membership criteria: what outstanding achievements are required for admission",
            "Admission/review process rigor (judged by recognized experts)",
            "Other notable members of the SAME association (peer comparison)",
        ],
        "exclude": [
            "Membership/certification where admission does NOT require outstanding achievements as judged by recognized experts",
            "Members of OTHER associations not relevant to applicant's membership",
        ],
        "subject_rule": "Subject must be the applicant, the qualifying association, or a distinguished member of the SAME association",
    },
    "published_material": {
        "include_direct": [
            "Articles/reports ABOUT the applicant and the applicant's work",
            "Interview or feature content where applicant is the subject of coverage",
        ],
        "include_supporting": [
            "Media outlet's credibility: circulation, history, awards, editorial standards",
            "Media outlet's ownership group or parent company reputation",
            "Publication date, title, author of the article about the applicant",
        ],
        "exclude": [
            "Articles written BY the applicant -- belongs to standard (vi) scholarly_articles",
            "Media coverage about other people (unless the applicant is also featured)",
            "Social media posts or non-professional publications",
        ],
        "subject_rule": "Subject must be the applicant (for coverage) OR the media outlet (for credibility linked to coverage about the applicant)",
    },
    "judging": {
        "include_direct": [
            "Snippets about the applicant serving as judge, reviewer, evaluator, or examiner",
            "Invitation or appointment letters for judging roles",
        ],
        "include_supporting": [
            "The organization/event where applicant judged: prestige, scale, authority",
            "Scope of judging: number of submissions, jury size, review rounds",
            "Other distinguished co-judges or panelists (peer comparison)",
        ],
        "exclude": [
            "Teaching or training activities -- being a trainer is NOT judging",
            "Mentoring students -- unless formally judging/examining their work",
            "The applicant being judged by others",
        ],
        "subject_rule": "Subject must be the applicant (as judge) OR the judging organization/event OR co-judges for peer comparison",
    },
    "original_contribution": {
        "include_direct": [
            "Description of the applicant's original contribution (methodology, system, product)",
            "Evidence of originality: what is new/novel about the contribution",
            "Evidence of major significance: widespread adoption, industry change",
        ],
        "include_supporting": [
            "Quantified impact data: adoption rate, user count, revenue, citations",
            "Independent expert recommendation letters praising the specific contribution",
            "Institutional or industry adoption of the applicant's work",
        ],
        "exclude": [
            "General professional experience not tied to an original contribution",
            "Routine business operations without innovation element",
            "Other people's contributions or inventions",
        ],
        "subject_rule": "Subject must be the applicant OR an expert/institution commenting on the applicant's contribution",
    },
    "scholarly_articles": {
        "include_direct": [
            "Articles, books, papers, or educational content authored BY the applicant",
            "Publication details: title, year, venue, authorship role",
        ],
        "include_supporting": [
            "Publication venue's prestige: impact factor, ranking, editorial standards",
            "Citation data and impact metrics of the applicant's publications",
        ],
        "exclude": [
            "Articles written ABOUT the applicant -- belongs to standard (iii)",
            "Content created by others",
        ],
        "subject_rule": "Subject must be the applicant (as author) OR the publication venue",
    },
    "display": {
        "include_direct": [
            "The applicant's work being displayed, exhibited, demonstrated, or showcased",
            "Event details: name, date, location, type of display",
        ],
        "include_supporting": [
            "Exhibition/showcase's prestige, scale, and professional standing",
            "Audience reach, attendance figures, industry recognition of the event",
        ],
        "exclude": [
            "Attending an event as a visitor (not displaying work)",
            "Sponsoring or funding an event without displaying work",
        ],
        "subject_rule": "Subject must be the applicant (as exhibitor) OR the exhibition/event",
    },
    "leading_role": {
        "include_direct": [
            # Prong 1: Leading/Critical Role
            "The applicant's title, position, founding role, ownership, or executive authority within an organization",
            "Evidence of decision-making authority, management scope, and day-to-day leadership responsibilities",
            "Company letters or testimonials confirming the applicant's critical role and leadership impact",
        ],
        "include_supporting": [
            # Prong 2: Distinguished Reputation of the Organization
            "Organization's founding, history, scale, industry standing, and notable achievements",
            "Government or national authority endorsements, approval letters, or official replies directed at the organization",
            "The organization's charter, articles of incorporation, or official registration demonstrating formal standing",
            "Press releases or media coverage about the organization's events, competitions, or milestones (attendance figures, participant counts, geographic reach)",
            "Partnerships with nationally/internationally recognized bodies (e.g., national sports associations, government agencies, industry federations)",
            "Third-party listings, profiles, or websites describing the organization as a recognized entity or business partner",
            "Recommendation letters that describe BOTH the applicant's leadership AND the organization's significance",
        ],
        "exclude": [
            "Entry-level or routine positions without leadership function",
            "Other people's roles at unrelated organizations",
        ],
        "subject_rule": "Subject may be: (1) the applicant in a leadership capacity, (2) the organization where the applicant serves, (3) a government/industry authority that endorses or partners with the organization, or (4) third-party sources documenting the organization's reputation. NOTE: evidence about the organization's distinguished reputation is equally important as evidence about the applicant's role — do NOT skip it.",
    },
    "high_salary": {
        "include_direct": [
            "The applicant's salary, compensation, contract amounts, consulting fees",
            "Employment contracts, pay stubs, tax records showing remuneration",
        ],
        "include_supporting": [
            "Industry salary benchmarks from authoritative sources",
            "Comparison data showing applicant earns significantly above average",
        ],
        "exclude": [
            "Company revenue not tied to applicant's personal remuneration",
            "Other people's salaries (unless used as industry comparison)",
            "Projected/future earnings without current documentation",
        ],
        "subject_rule": "Subject must be the applicant (for compensation) OR an industry benchmark source",
    },
    "commercial_success": {
        "include_direct": [
            "Sales data, revenue figures, attendance for applicant's work",
            "Business metrics directly tied to applicant's professional output",
        ],
        "include_supporting": [
            "Industry benchmarks for commercial performance comparison",
            "Media or industry recognition of commercial success",
        ],
        "exclude": [
            "General company financials not tied to applicant's specific work",
            "Other people's commercial achievements",
        ],
        "subject_rule": "Subject must be the applicant OR the applicant's business/venture",
    },
    "overall_merits": {
        "include_direct": [
            "Cross-criteria evidence demonstrating overall extraordinary ability",
            "Expert testimonials spanning multiple criteria",
        ],
        "include_supporting": [
            "Industry-wide recognition not fitting neatly into other categories",
        ],
        "exclude": [
            "Evidence that clearly belongs to a specific standard (i)-(x)",
        ],
        "subject_rule": "Subject must be the applicant",
    },
}


# ==================== NIW Top-Down Pickup Criteria ====================

_NIW_TOPDOWN_PICKUP_CRITERIA = {
    "prong1_merit": {
        "include_direct": [
            "Description of the applicant's proposed endeavor: specific research direction, methodology, technology, product, or business plan",
            "Evidence of substantial merit: the endeavor's value to its field (advances knowledge, solves important problems, creates economic value)",
            "Evidence of national importance: the endeavor's potential impact beyond a particular locality (policy alignment, field-wide adoption, societal benefit)",
            "Field-level context: the significance of the problem the endeavor addresses, industry trends, market need",
        ],
        "include_supporting": [
            "Expert recommendation letters that describe and endorse the significance of the ENDEAVOR (not just the person)",
            "Quantitative impact data demonstrating the endeavor's reach or potential (adoption metrics, revenue, citations, users)",
            "Government policy documents, industry reports, or news articles showing alignment between the endeavor and national priorities",
            "Media coverage or published material about the applicant's work and its field-level importance",
        ],
        "exclude": [
            "Personal biographical details with NO connection to the proposed endeavor (e.g., hobbies, unrelated work history)",
            "Purely administrative documents (visa stamps, passport pages, address records)",
            "Evidence that ONLY describes the applicant's qualifications without linking them to the endeavor's merit or importance — belongs in Prong 2",
        ],
        "subject_rule": "Subject may be: the applicant's proposed endeavor, the field/industry the endeavor impacts, experts endorsing the endeavor's significance, or policy/market context supporting national importance. Focus is on WHAT the applicant proposes to do, not WHO the applicant is.",
    },
    "prong2_positioned": {
        "include_direct": [
            "Education: degrees, universities, specialized training, certifications",
            "Skills and knowledge: domain expertise, technical competencies, language abilities",
            "Record of success: publications, patents, awards, honors, citation metrics, industry recognition",
            "Track record in related or similar efforts: prior projects, previous positions, measurable achievements",
        ],
        "include_supporting": [
            "Expert recommendation letters that attest to the applicant's qualifications, expertise, and track record",
            "A model or plan for future activities: research proposals, business plans, collaboration agreements",
            "Progress towards achieving the proposed endeavor: current position, ongoing projects, milestones reached",
            "Interest of potential customers, users, investors, or relevant entities: adoption data, letters of intent, partnerships",
            "Recommender credentials that establish authority to evaluate the applicant (credibility proof)",
        ],
        "exclude": [
            "Evidence about the endeavor's merit/importance without connection to the applicant's ability to advance it — belongs in Prong 1",
            "Purely administrative documents (visa stamps, passport pages, address records)",
        ],
        "subject_rule": "Subject may be: the applicant (education, skills, achievements), experts evaluating the applicant's qualifications, institutions where the applicant has worked or studied, or entities showing interest in the applicant's work. Focus is on WHO the applicant is and WHY they can succeed.",
    },
    "prong3_balance": {
        "include_direct": [
            "Evidence that labor certification is impractical: self-directed research, entrepreneurial ventures, multi-institutional collaborations, work that cannot be captured in a PERM job description",
            "Evidence that the U.S. would benefit even if qualified U.S. workers are available: unique expertise, irreplaceable contributions, specialized knowledge that others lack",
            "Evidence that benefits extend beyond a single employer: field-wide impact, public interest, multi-sector applications, open-source or publicly available work",
            "Evidence of urgency: time-sensitive national priorities, critical workforce shortages, government policy alignment",
        ],
        "include_supporting": [
            "Government policy initiatives aligned with the applicant's work (executive orders, legislation, federal funding programs)",
            "Industry demand data or workforce shortage reports in the applicant's field",
            "Expert statements that EXPLICITLY address why the applicant's contributions serve the NATIONAL INTEREST or why waiver is justified",
            "Evidence of the applicant's work benefiting MULTIPLE institutions, organizations, or the public (not just one employer)",
        ],
        "exclude": [
            "Generic statements about immigration benefits without specific connection to this applicant",
            "Evidence that only shows the applicant is qualified (Prong 2) without linking to why waiver serves national interest",
            "General biographical details, routine education records, or employment history that do not speak to waiver justification",
            "Recommendation letters that only praise the applicant's skills without addressing national interest or waiver — these belong in Prong 2",
            "Publication lists, citation counts, or award names without context connecting them to the waiver argument",
        ],
        "subject_rule": "Subject may be: the applicant's work and its BROADER societal impact, government/policy context supporting urgency, industry demand for the applicant's expertise, or institutions that benefit from the applicant's contributions. Focus is on WHY the national interest is better served by waiving labor certification. Be SELECTIVE — only include evidence with a clear connection to the waiver argument.",
    },
}


async def _topdown_pickup_for_standard(
    standard_key: str,
    standard_info: Dict,
    all_snippets: List[Dict],
    provider: str = "deepseek"
) -> List[Dict]:
    """
    Top-down: LLM 从全量 applicant snippet 中为一个 standard 挑选相关证据。
    返回被选中的 snippet 列表，每个附加 _topdown_chain 字段。
    """
    # Build exhibit-level source context from snippets
    # Aggregates recommender_name, source_credibility subjects, and org names per exhibit
    from collections import defaultdict as _defaultdict
    _exhibit_sources = _defaultdict(set)
    for snp in all_snippets:
        eid = snp.get('exhibit_id', '')
        if not eid:
            continue
        # Recommender name (already extracted by unified_extractor)
        rec = snp.get('recommender_name', '')
        if rec:
            _exhibit_sources[eid].add(rec)
        # Source credibility snippets — the subject is often the authoritative source
        if snp.get('evidence_type') in ('source_credibility', 'membership_criteria') and snp.get('subject_role') in ('organization', 'media', 'event'):
            subj = snp.get('subject', '')
            if subj and len(subj) < 60:
                _exhibit_sources[eid].add(subj)
    # Build compact label per exhibit: "F4(China Weightlifting Association)"
    exhibit_label = {}
    for eid, sources in _exhibit_sources.items():
        # Pick the shortest meaningful source name (avoid overly long ones)
        best = min(sources, key=len) if sources else ''
        if best:
            exhibit_label[eid] = f"{eid}({best})"
        else:
            exhibit_label[eid] = eid

    # 压缩 snippet 表示，减少 token 用量
    compact_lines = []
    snippet_lookup = {}
    for snp in all_snippets:
        sid = snp.get('snippet_id', snp.get('id', ''))
        snippet_lookup[sid] = snp
        exhibit_id = snp.get('exhibit_id', '')
        evidence_type = snp.get('evidence_type', '')
        subject = snp.get('subject', '')
        text = snp.get('text', '')[:150]
        ex_label = exhibit_label.get(exhibit_id, exhibit_id)
        compact_lines.append(
            f"[{sid}] exhibit={ex_label} type={evidence_type} subject={subject} text={text}"
        )

    snippets_text = "\n".join(compact_lines)

    # Per-standard pickup criteria
    pickup_criteria = _TOPDOWN_PICKUP_CRITERIA.get(standard_key, {})
    include_direct = pickup_criteria.get("include_direct", [])
    include_supporting = pickup_criteria.get("include_supporting", [])
    exclude_rules = pickup_criteria.get("exclude", [])
    subject_rule = pickup_criteria.get("subject_rule", "Subject must be the applicant")

    include_text = ""
    if include_direct:
        include_text += "DIRECT evidence (must include):\n"
        for item in include_direct:
            include_text += f"  - {item}\n"
    if include_supporting:
        include_text += "Valid SUPPORTING evidence:\n"
        for item in include_supporting:
            include_text += f"  - {item}\n"

    exclude_text = ""
    if exclude_rules:
        exclude_text = "EXCLUDE (do NOT select):\n"
        for item in exclude_rules:
            exclude_text += f"  - {item}\n"

    system_prompt = f"""You are an immigration law expert specializing in EB-1A petitions.
Your task: select snippets relevant to a specific EB-1A evidentiary standard.

SELECTION RULES:
{include_text}
{exclude_text}
SUBJECT RULE: {subject_rule}

Group selected snippets into "chains" — a chain is a group of snippets about the same
media outlet, award, organization, event, or publication.

Return COMPACT JSON (to avoid output truncation):
{{
  "chains": {{
    "chain label": ["snippet_id_1", "snippet_id_2", ...]
  }}
}}

If no snippets are relevant, return {{"chains": {{}}}}.
"""

    user_prompt = f"""## Standard: {standard_info.get('name', standard_key)}
**Citation**: {standard_info.get('citation', '')}
**Legal Requirements**:
{standard_info.get('requirements', '')}

## All Available Snippets ({len(all_snippets)} total)
{snippets_text}

Select snippets relevant to "{standard_info.get('name', standard_key)}" following the selection rules above.
"""

    try:
        result = await call_llm(
            prompt=user_prompt,
            provider=provider,
            system_prompt=system_prompt,
            temperature=0.1,
            max_tokens=8192
        )

        # Parse new compact format: {chains: {chain_label: [snippet_ids]}}
        chains_data = result.get('chains', {})

        # Fallback: old format {selected: [{snippet_id, chain, ...}]}
        if not chains_data and result.get('selected'):
            for item in result['selected']:
                chain = item.get('chain', 'uncategorized')
                sid = item.get('snippet_id', '')
                chains_data.setdefault(chain, []).append(sid)

        # Fallback: if extract_json failed (truncated response), try to recover
        if not chains_data and 'content' in result and isinstance(result['content'], str):
            raw = result['content']
            try:
                import re
                # Try to find "chain_label": ["id1", "id2", ...] patterns
                for match in re.finditer(r'"([^"]+)"\s*:\s*\[([^\]]*)\]', raw):
                    chain_label = match.group(1)
                    if chain_label == 'chains':
                        continue
                    ids_str = match.group(2)
                    ids = re.findall(r'"(snp_[^"]+)"', ids_str)
                    if ids:
                        chains_data[chain_label] = ids
                if chains_data:
                    print(f"[TopDown] {standard_key}: recovered {len(chains_data)} chains from truncated response")
            except Exception as recover_err:
                print(f"[TopDown] {standard_key}: recovery failed: {recover_err}")

        selected_snippets = []
        for chain_label, snippet_ids in chains_data.items():
            for sid in snippet_ids:
                if sid in snippet_lookup:
                    snp_copy = dict(snippet_lookup[sid])
                    snp_copy['_topdown_chain'] = chain_label
                    snp_copy['_topdown_relevance'] = 'direct'
                    selected_snippets.append(snp_copy)

        print(f"[TopDown] {standard_key}: selected {len(selected_snippets)}/{len(all_snippets)} snippets, "
              f"{len(chains_data)} chains")
        return selected_snippets

    except Exception as e:
        print(f"[TopDown] Error for {standard_key}: {e}, falling back to bottom-up mapping")
        return []  # caller handles fallback


async def _group_snippets_by_standard_topdown(
    snippets: List[Dict],
    legal_stds: Dict,
    provider: str = "deepseek",
    project_id: str = None
) -> Dict[str, List[Dict]]:
    """
    Top-down snippet grouping: per-standard LLM 从全量 snippet 中挑选。
    并行调用所有 standard，失败时直接抛出异常。
    输出格式与 _group_snippets_by_standard() 相同。

    如果 project_id 提供，保存中间 pickup 结果到 arguments/topdown_pickup.json。
    """
    # 默认只用 applicant snippet
    applicant_snippets = [
        snp for snp in snippets
        if snp.get('is_applicant_achievement', True)
    ]
    # leading_role / display 需要第三方对组织的描述（is_applicant_achievement=False），
    # 使用全量 snippet
    _STANDARDS_NEED_ALL_SNIPPETS = {"leading_role", "display"}

    print(f"[TopDown] Starting top-down pickup for {len(legal_stds)} standards "
          f"with {len(applicant_snippets)} applicant snippets "
          f"(+{len(snippets) - len(applicant_snippets)} non-applicant for org-reputation standards)")

    # 并行调用所有 standard
    tasks = []
    std_keys = []
    for std_key, std_info in legal_stds.items():
        std_keys.append(std_key)
        pool = snippets if std_key in _STANDARDS_NEED_ALL_SNIPPETS else applicant_snippets
        tasks.append(
            _topdown_pickup_for_standard(std_key, std_info, pool, provider)
        )

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 组装结果，异常时直接报错（不再 fallback 到 bottom-up）
    grouped = {std: [] for std in legal_stds.keys()}

    for std_key, result in zip(std_keys, results):
        if isinstance(result, Exception):
            print(f"[TopDown] {std_key} FAILED: {result}")
            raise RuntimeError(f"Top-down pickup failed for {std_key}: {result}")
        grouped[std_key] = result

    # Summary + save intermediate results
    pickup_report = {}
    for std_key, snps in grouped.items():
        if snps:
            chains = set(s.get('_topdown_chain', '') for s in snps)
            chains.discard('')
            chain_info = f", chains: {chains}" if chains else ""
            print(f"[TopDown] {std_key}: {len(snps)} snippets{chain_info}")
            pickup_report[std_key] = {
                "count": len(snps),
                "chains": sorted(chains),
                "snippet_ids": [s.get('snippet_id', s.get('id', '')) for s in snps],
                "details": [
                    {
                        "snippet_id": s.get('snippet_id', s.get('id', '')),
                        "exhibit_id": s.get('exhibit_id', ''),
                        "evidence_type": s.get('evidence_type', ''),
                        "chain": s.get('_topdown_chain', ''),
                        "relevance": s.get('_topdown_relevance', ''),
                        "text": s.get('text', '')[:150],
                    }
                    for s in snps
                ],
            }

    # Save intermediate pickup results for evaluation
    if project_id:
        try:
            projects_dir = Path(__file__).parent.parent.parent / "data" / "projects"
            args_dir = projects_dir / project_id / "arguments"
            args_dir.mkdir(parents=True, exist_ok=True)
            pickup_file = args_dir / "topdown_pickup.json"
            with open(pickup_file, 'w', encoding='utf-8') as f:
                json.dump({
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "total_applicant_snippets": len(applicant_snippets),
                    "standards_count": len(legal_stds),
                    "pickup_by_standard": pickup_report,
                }, f, ensure_ascii=False, indent=2)
            print(f"[TopDown] Saved pickup results to {pickup_file}")
        except Exception as e:
            print(f"[TopDown] Warning: could not save pickup results: {e}")

    return grouped


# ==================== NIW Top-Down Pickup ====================

async def _niw_topdown_pickup_for_prong(
    prong_key: str,
    prong_info: Dict,
    all_snippets: List[Dict],
    provider: str = "deepseek",
    cross_prong_context: str = ""
) -> List[Dict]:
    """
    NIW top-down: LLM selects snippets relevant to a specific Dhanasar prong.
    For Prong 3, cross_prong_context provides Prong 1/2 pickup summary.
    Returns selected snippets, each with _topdown_chain field.
    """
    from collections import defaultdict as _defaultdict

    # Build exhibit-level source context
    _exhibit_sources = _defaultdict(set)
    for snp in all_snippets:
        eid = snp.get('exhibit_id', '')
        if not eid:
            continue
        rec = snp.get('recommender_name', '')
        if rec:
            _exhibit_sources[eid].add(rec)
        if snp.get('evidence_type') in ('source_credibility', 'recommendation') and snp.get('subject_role') in ('organization', 'media', 'event', 'recommender'):
            subj = snp.get('subject', '')
            if subj and len(subj) < 60:
                _exhibit_sources[eid].add(subj)

    exhibit_label = {}
    for eid, sources in _exhibit_sources.items():
        best = min(sources, key=len) if sources else ''
        exhibit_label[eid] = f"{eid}({best})" if best else eid

    # Compress snippets
    compact_lines = []
    snippet_lookup = {}
    for snp in all_snippets:
        sid = snp.get('snippet_id', snp.get('id', ''))
        snippet_lookup[sid] = snp
        exhibit_id = snp.get('exhibit_id', '')
        evidence_type = snp.get('evidence_type', '')
        subject = snp.get('subject', '')
        text = snp.get('text', '')[:150]
        ex_label = exhibit_label.get(exhibit_id, exhibit_id)
        compact_lines.append(
            f"[{sid}] exhibit={ex_label} type={evidence_type} subject={subject} text={text}"
        )

    snippets_text = "\n".join(compact_lines)

    # Per-prong pickup criteria
    pickup_criteria = _NIW_TOPDOWN_PICKUP_CRITERIA.get(prong_key, {})
    include_direct = pickup_criteria.get("include_direct", [])
    include_supporting = pickup_criteria.get("include_supporting", [])
    exclude_rules = pickup_criteria.get("exclude", [])
    subject_rule = pickup_criteria.get("subject_rule", "Subject must be the applicant")

    include_text = ""
    if include_direct:
        include_text += "DIRECT evidence (must include):\n"
        for item in include_direct:
            include_text += f"  - {item}\n"
    if include_supporting:
        include_text += "Valid SUPPORTING evidence:\n"
        for item in include_supporting:
            include_text += f"  - {item}\n"

    exclude_text = ""
    if exclude_rules:
        exclude_text = "EXCLUDE (do NOT select):\n"
        for item in exclude_rules:
            exclude_text += f"  - {item}\n"

    cross_prong_section = ""
    if cross_prong_context:
        cross_prong_section = f"""
CROSS-PRONG CONTEXT (evidence already selected for Prong 1 & 2):
{cross_prong_context}

INSTRUCTIONS FOR PRONG 3 PICKUP:
- Dhanasar allows cross-prong consideration: "USCIS may consider... the degree to which
  other evidence of record — including evidence submitted to meet other prongs — supports
  the finding that the foreign national's entry will serve the national interest."
- You MAY selectively include a SMALL number of the STRONGEST Prong 1/2 snippets that
  directly support a specific waiver argument (e.g., a policy document showing urgency,
  an expert quote about irreplaceable expertise). Do NOT bulk-include all Prong 1/2 evidence.
- Your PRIMARY focus is evidence that specifically addresses: impracticality of labor cert,
  national benefit despite available U.S. workers, benefits beyond a single employer, and urgency.
- Target: select roughly 30-50% of total snippets for Prong 3, NOT 80-100%.
"""

    system_prompt = f"""You are an immigration law expert specializing in NIW (National Interest Waiver) petitions under Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016).

Your task: select snippets relevant to a specific Dhanasar prong from the full evidence pool.

SELECTION RULES:
{include_text}
{exclude_text}
SUBJECT RULE: {subject_rule}

IMPORTANT NIW CONTEXT:
- NIW has three prongs under Dhanasar. You are selecting for ONE prong.
- For Prong 1 & 2: be INCLUSIVE — if a snippet is arguably relevant, include it.
- For Prong 3 (waiver): be SELECTIVE — only include evidence with a CLEAR connection to the waiver argument. Do NOT bulk-include everything.
- Recommendation letters often support multiple prongs — include them if they contain content relevant to THIS prong.
{cross_prong_section}
Group selected snippets into "chains" — a chain is a group of snippets about the same
topic, recommender, organization, or evidence theme.

Return COMPACT JSON (to avoid output truncation):
{{
  "chains": {{
    "chain label": ["snippet_id_1", "snippet_id_2", ...]
  }}
}}

If no snippets are relevant, return {{"chains": {{}}}}.
"""

    user_prompt = f"""## Dhanasar Prong: {prong_info.get('name', prong_key)}
**Citation**: {prong_info.get('citation', '')}
**Legal Requirements**:
{prong_info.get('requirements', '')}

## All Available Snippets ({len(all_snippets)} total)
{snippets_text}

Select snippets relevant to "{prong_info.get('name', prong_key)}" following the selection rules above.
"""

    try:
        result = await call_llm(
            prompt=user_prompt,
            provider=provider,
            system_prompt=system_prompt,
            temperature=0.1,
            max_tokens=8192
        )

        chains_data = result.get('chains', {})

        # Fallback: old format
        if not chains_data and result.get('selected'):
            for item in result['selected']:
                chain = item.get('chain', 'uncategorized')
                sid = item.get('snippet_id', '')
                chains_data.setdefault(chain, []).append(sid)

        # Fallback: truncated response recovery
        if not chains_data and 'content' in result and isinstance(result['content'], str):
            raw = result['content']
            try:
                import re
                for match in re.finditer(r'"([^"]+)"\s*:\s*\[([^\]]*)\]', raw):
                    chain_label = match.group(1)
                    if chain_label == 'chains':
                        continue
                    ids_str = match.group(2)
                    ids = re.findall(r'"(snp_[^"]+)"', ids_str)
                    if ids:
                        chains_data[chain_label] = ids
                if chains_data:
                    print(f"[NIW-TopDown] {prong_key}: recovered {len(chains_data)} chains from truncated response")
            except Exception as recover_err:
                print(f"[NIW-TopDown] {prong_key}: recovery failed: {recover_err}")

        selected_snippets = []
        for chain_label, snippet_ids in chains_data.items():
            for sid in snippet_ids:
                if sid in snippet_lookup:
                    snp_copy = dict(snippet_lookup[sid])
                    snp_copy['_topdown_chain'] = chain_label
                    snp_copy['_topdown_relevance'] = 'direct'
                    selected_snippets.append(snp_copy)

        print(f"[NIW-TopDown] {prong_key}: selected {len(selected_snippets)}/{len(all_snippets)} snippets, "
              f"{len(chains_data)} chains")
        return selected_snippets

    except Exception as e:
        print(f"[NIW-TopDown] Error for {prong_key}: {e}")
        return []  # caller handles fallback


async def _niw_group_snippets_by_prong_topdown(
    snippets: List[Dict],
    provider: str = "deepseek",
    project_id: str = None
) -> Dict[str, List[Dict]]:
    """
    NIW top-down snippet grouping: per-prong LLM selects from full snippet pool.

    Flow: Prong 1 & 2 in parallel → build cross-prong context → Prong 3 with context.
    This mirrors Dhanasar's structure: Prong 3 (waiver) reframes Prong 1/2 evidence.

    Returns {prong_key: [selected_snippets]}.
    """
    print(f"[NIW-TopDown] Starting top-down pickup for 3 Dhanasar prongs "
          f"with {len(snippets)} total snippets")

    grouped = {prong: [] for prong in NIW_LEGAL_STANDARDS.keys()}

    # Phase 1: Prong 1 & Prong 2 in parallel
    print("[NIW-TopDown] Phase 1: Prong 1 & 2 in parallel...")
    p1_info = NIW_LEGAL_STANDARDS["prong1_merit"]
    p2_info = NIW_LEGAL_STANDARDS["prong2_positioned"]
    p1_task = _niw_topdown_pickup_for_prong("prong1_merit", p1_info, snippets, provider)
    p2_task = _niw_topdown_pickup_for_prong("prong2_positioned", p2_info, snippets, provider)

    results_12 = await asyncio.gather(p1_task, p2_task, return_exceptions=True)

    for prong_key, result in zip(["prong1_merit", "prong2_positioned"], results_12):
        if isinstance(result, Exception):
            print(f"[NIW-TopDown] {prong_key} FAILED: {result}")
            raise RuntimeError(f"NIW top-down pickup failed for {prong_key}: {result}")
        grouped[prong_key] = result

    # Phase 2: Build cross-prong context from Prong 1/2 results for Prong 3
    print("[NIW-TopDown] Phase 2: Prong 3 with Prong 1/2 context...")
    cross_prong_lines = []
    for pk in ["prong1_merit", "prong2_positioned"]:
        snps = grouped[pk]
        if not snps:
            continue
        chains = {}
        for s in snps:
            chain = s.get('_topdown_chain', 'other')
            chains.setdefault(chain, []).append(s)
        chain_summaries = []
        for chain_label, chain_snps in chains.items():
            sids = [s.get('snippet_id', s.get('id', '')) for s in chain_snps]
            sample_text = chain_snps[0].get('text', '')[:100] if chain_snps else ''
            chain_summaries.append(f"  - {chain_label} ({len(sids)} snippets): {sample_text}...")
        pk_name = NIW_LEGAL_STANDARDS[pk].get('name', pk)
        cross_prong_lines.append(f"\n{pk_name} ({len(snps)} snippets selected):")
        cross_prong_lines.extend(chain_summaries)

    cross_prong_context = "\n".join(cross_prong_lines) if cross_prong_lines else ""

    p3_info = NIW_LEGAL_STANDARDS["prong3_balance"]
    p3_result = await _niw_topdown_pickup_for_prong(
        "prong3_balance", p3_info, snippets, provider,
        cross_prong_context=cross_prong_context
    )
    if isinstance(p3_result, Exception):
        raise RuntimeError(f"NIW top-down pickup failed for prong3_balance: {p3_result}")
    grouped["prong3_balance"] = p3_result

    # Summary + save intermediate results
    pickup_report = {}
    for prong_key, snps in grouped.items():
        if snps:
            chains = set(s.get('_topdown_chain', '') for s in snps)
            chains.discard('')
            chain_info = f", chains: {sorted(chains)}" if chains else ""
            print(f"[NIW-TopDown] {prong_key}: {len(snps)} snippets{chain_info}")
            pickup_report[prong_key] = {
                "count": len(snps),
                "chains": sorted(chains),
                "snippet_ids": [s.get('snippet_id', s.get('id', '')) for s in snps],
            }

    if project_id:
        try:
            projects_dir = Path(__file__).parent.parent.parent / "data" / "projects"
            args_dir = projects_dir / project_id / "arguments"
            args_dir.mkdir(parents=True, exist_ok=True)
            pickup_file = args_dir / "niw_topdown_pickup.json"
            with open(pickup_file, 'w', encoding='utf-8') as f:
                json.dump({
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "total_snippets": len(snippets),
                    "prongs_count": len(NIW_LEGAL_STANDARDS),
                    "pickup_by_prong": pickup_report,
                }, f, ensure_ascii=False, indent=2)
            print(f"[NIW-TopDown] Saved pickup results to {pickup_file}")
        except Exception as e:
            print(f"[NIW-TopDown] Warning: could not save pickup results: {e}")

    return grouped


def _group_snippets_by_standard(
    snippets: List[Dict],
    legal_stds: Dict = None,
    evidence_mapping: Dict = None
) -> Dict[str, List[Dict]]:
    """按 standard 分组"""
    if legal_stds is None:
        legal_stds = LEGAL_STANDARDS
    if evidence_mapping is None:
        evidence_mapping = _EB1A_EVIDENCE_TYPE_MAPPING

    grouped = {std: [] for std in legal_stds.keys()}

    for snp in snippets:
        if not snp.get('is_applicant_achievement', True):
            continue
        etype = snp.get('evidence_type', '').lower()
        standard = evidence_mapping.get(etype)
        if standard and standard in grouped:
            grouped[standard].append(snp)

    return grouped


def _format_standards_text(legal_stds: Dict = None, only_keys: set = None) -> str:
    """Format legal standards text, optionally filtered to only standards with evidence."""
    if legal_stds is None:
        legal_stds = LEGAL_STANDARDS
    lines = []
    for std_key, std_info in legal_stds.items():
        if only_keys and std_key not in only_keys:
            continue
        lines.append(f"### {std_info['name']} ({std_info['citation']}) [key: {std_key}]")
        lines.append(std_info['requirements'])
        lines.append("")
    return "\n".join(lines)


def _format_snippets_by_standard(grouped: Dict[str, List[Dict]], applicant_name: str, legal_stds: Dict = None) -> str:
    """格式化 snippets 按标准分组"""
    if legal_stds is None:
        legal_stds = LEGAL_STANDARDS
    lines = []

    for std_key, snps in grouped.items():
        if not snps:
            continue
        std_info = legal_stds.get(std_key, {})
        lines.append(f"### {std_info.get('name', std_key)} ({len(snps)} snippets)")

        for i, snp in enumerate(snps[:30], 1):  # Limit to 30 per standard
            sid = snp.get('snippet_id', snp.get('id', ''))
            text = snp.get('text', '')[:200]
            exhibit = snp.get('exhibit_id', '')
            subject = snp.get('subject', '')
            chain_label = snp.get('_topdown_chain', '')
            chain_str = f" [chain: {chain_label}]" if chain_label else ""
            lines.append(f"[{sid}] (Exhibit {exhibit}{chain_str}, subject: {subject}) {text}...")

        if len(snps) > 30:
            lines.append(f"... and {len(snps) - 30} more snippets")
        lines.append("")

    return "\n".join(lines)


# ==================== NIW v2 Functions ====================

async def niw_classify_other_snippets(
    other_snippets: List[Dict], provider: str = "deepseek"
) -> Dict[str, str]:
    """
    将 'other' 类型 snippet 分类到 prong，返回 {snippet_id: prong_key}。
    批量发送（每批 50 条）。
    """
    if not other_snippets:
        return {}

    result_map = {}
    batch_size = 50

    for batch_start in range(0, len(other_snippets), batch_size):
        batch = other_snippets[batch_start:batch_start + batch_size]

        # Format snippets for prompt
        lines = []
        for snp in batch:
            sid = snp.get('snippet_id', snp.get('id', ''))
            text = snp.get('text', '')[:200]
            exhibit = snp.get('exhibit_id', '')
            lines.append(f"[{sid}] (Exhibit {exhibit}) {text}")

        snippets_text = "\n".join(lines)

        try:
            result = await call_llm(
                prompt=NIW_CLASSIFY_OTHER_USER_PROMPT.format(snippets_text=snippets_text),
                provider=provider,
                system_prompt=NIW_CLASSIFY_OTHER_SYSTEM_PROMPT,
                temperature=0.1,
                max_tokens=4000
            )

            classifications = result.get('classifications', [])
            for item in classifications:
                sid = item.get('snippet_id', '')
                prong = item.get('prong', 'skip')
                if prong in ('prong1_merit', 'prong2_positioned', 'prong3_balance', 'skip'):
                    result_map[sid] = prong
                else:
                    result_map[sid] = 'prong2_positioned'  # default fallback

            print(f"[NIW-v2] Classified batch {batch_start//batch_size + 1}: "
                  f"{len(classifications)} snippets")

        except Exception as e:
            print(f"[NIW-v2] Error classifying other snippets batch: {e}")
            # Fallback: assign all to prong2
            for snp in batch:
                sid = snp.get('snippet_id', snp.get('id', ''))
                result_map[sid] = 'prong2_positioned'

        if batch_start + batch_size < len(other_snippets):
            await asyncio.sleep(0.3)

    # Summary
    prong_counts = {}
    for prong in result_map.values():
        prong_counts[prong] = prong_counts.get(prong, 0) + 1
    print(f"[NIW-v2] Other snippet classification: {prong_counts}")

    return result_map


async def niw_organize_per_prong(
    prong_key: str, prong_snippets: List[Dict],
    applicant_name: str, provider: str = "deepseek"
) -> Tuple[LegalArgument, List[Dict]]:
    """
    对单个 prong 的所有 snippet 调用 LLM 组织成 sub-arguments。

    Returns:
        (LegalArgument for this prong, list of sub_argument dicts)
    """
    prong_info = NIW_LEGAL_STANDARDS.get(prong_key, {})
    prong_name = prong_info.get('name', prong_key)
    prong_citation = prong_info.get('citation', '')
    prong_description = prong_info.get('requirements', '')

    # Create simplified ID mapping for the prompt
    id_mapping = {}  # simple_id -> real_snippet_id
    lines = []
    truncate_text = len(prong_snippets) > 50

    for i, snp in enumerate(prong_snippets, 1):
        real_id = snp.get('snippet_id', snp.get('id', ''))
        simple_id = f"S{i}"
        id_mapping[simple_id] = real_id

        text = snp.get('text', '')
        if truncate_text:
            text = text[:150]
        else:
            text = text[:300]
        exhibit = snp.get('exhibit_id', '')
        etype = snp.get('evidence_type', '')
        lines.append(f"[{simple_id}] (Exhibit {exhibit}, type: {etype}) {text}")

    snippets_text = "\n".join(lines)

    # Prong 3 with very few snippets: generate template sub-arguments
    # by legal component (policy argument, not evidence-grouping)
    all_real_ids = list(id_mapping.values())
    if prong_key == "prong3_balance" and len(prong_snippets) <= 3:
        arg_id = f"arg-{uuid.uuid4().hex[:8]}"
        template_components = [
            ("Impracticality of Labor Certification",
             "Why the PERM process is unsuitable for this beneficiary's work",
             "Demonstrates PERM impracticality"),
            ("National Benefit Analysis",
             "Concrete national benefits from the beneficiary's contributions",
             "Establishes national interest"),
            ("Benefits Beyond Single Employer",
             "Work transcends any single employer's interests",
             "Proves cross-employer impact"),
            ("Explicit Balancing — Waiver Justification",
             "Weighing national interest against labor market protection",
             "Concludes waiver justification"),
        ]
        sub_arguments = []
        for title, purpose, relationship in template_components:
            sa_dict = {
                "id": f"subarg-{uuid.uuid4().hex[:8]}",
                "argument_id": arg_id,
                "title": title,
                "purpose": purpose,
                "relationship": relationship,
                "snippet_ids": all_real_ids,  # all snippets shared
                "is_ai_generated": True,
                "status": "draft",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            sub_arguments.append(sa_dict)

        argument = LegalArgument(
            id=arg_id,
            standard=prong_key,
            title=f"{applicant_name}'s {prong_name}",
            rationale=f"Template-based: {len(template_components)} legal components, "
                      f"{len(prong_snippets)} snippets shared across all",
            snippet_ids=all_real_ids,
            evidence_strength="medium",
            sub_argument_ids=[sa["id"] for sa in sub_arguments],
            subject=applicant_name,
        )
        print(f"[NIW-v2] Prong3 template: {len(sub_arguments)} sub-args "
              f"(snippet count {len(prong_snippets)} <= 3, using legal components)")
        return argument, sub_arguments

    # Determine target sub-argument count
    n = len(prong_snippets)
    if n <= 5:
        target = "2-3"
    elif n <= 10:
        target = "3-5"
    elif n <= 30:
        target = "4-6"
    else:
        target = "5-8"

    # Prong-specific organization hints
    prong_hint = ""
    if prong_key == "prong1_merit":
        prong_hint = (
            "\n\nIMPORTANT for Prong 1: You MUST create SEPARATE sub-arguments for "
            "'Substantial Merit' and 'National Importance' — these are two distinct legal "
            "elements. Do NOT merge them into one sub-argument."
        )
    elif prong_key == "prong2_positioned":
        prong_hint = (
            "\n\nIMPORTANT for Prong 2: Create separate sub-arguments for distinct "
            "dimensions (e.g., education, track record, awards, publications, expert "
            "endorsements, future plans). Do NOT collapse all evidence into one group."
        )

    user_prompt = NIW_PRONG_ORGANIZE_USER_PROMPT.format(
        prong_name=prong_name,
        prong_citation=prong_citation,
        applicant_name=applicant_name,
        prong_description=prong_description,
        snippet_count=len(prong_snippets),
        snippets_text=snippets_text,
        target_subargs=target,
    ) + prong_hint

    arg_id = f"arg-{uuid.uuid4().hex[:8]}"

    try:
        result = await call_llm(
            prompt=user_prompt,
            provider=provider,
            system_prompt=NIW_PRONG_ORGANIZE_SYSTEM_PROMPT,
            temperature=0.1,
            max_tokens=8000
        )

        raw_sub_args = result.get('sub_arguments', [])
        print(f"[NIW-v2] Prong {prong_key}: LLM returned {len(raw_sub_args)} sub-arguments")

        if not raw_sub_args:
            # Fallback: single sub-argument with all snippets
            raw_sub_args = [{
                "title": f"{applicant_name}'s Evidence for {prong_name}",
                "purpose": f"All evidence supporting {prong_name}",
                "relationship": f"Supports {prong_name}",
                "snippet_ids": [f"S{i}" for i in range(1, len(prong_snippets) + 1)],
            }]

        # Minimum floor: if LLM collapsed to 1 sub-arg with >5 snippets, force split
        if len(raw_sub_args) == 1 and len(prong_snippets) > 5:
            single = raw_sub_args[0]
            all_sids = single.get('snippet_ids', [])
            mid = len(all_sids) // 2
            if prong_key == "prong1_merit":
                # P1 natural split: substantial merit vs national importance
                raw_sub_args = [
                    {"title": f"Substantial Merit of {applicant_name}'s Proposed Endeavor",
                     "purpose": "Establishes the endeavor has substantial merit",
                     "relationship": "Demonstrates substantial merit",
                     "snippet_ids": all_sids[:mid]},
                    {"title": f"National Importance of {applicant_name}'s Endeavor",
                     "purpose": "Establishes the endeavor has national-level importance",
                     "relationship": "Demonstrates national importance",
                     "snippet_ids": all_sids[mid:]},
                ]
            else:
                # Generic split by halves
                raw_sub_args = [
                    {"title": single.get('title', 'Evidence Group') + " (Part 1)",
                     "purpose": single.get('purpose', ''),
                     "relationship": single.get('relationship', f'Supports {prong_name}'),
                     "snippet_ids": all_sids[:mid]},
                    {"title": single.get('title', 'Evidence Group') + " (Part 2)",
                     "purpose": single.get('purpose', ''),
                     "relationship": single.get('relationship', f'Supports {prong_name}'),
                     "snippet_ids": all_sids[mid:]},
                ]
            print(f"[NIW-v2] Prong {prong_key}: forced split from 1 → {len(raw_sub_args)} sub-args (minimum floor)")

        # Convert sub-arguments, mapping simple IDs back to real IDs
        sub_arguments = []
        all_assigned_real_ids = set()

        for raw_sa in raw_sub_args:
            simple_ids = raw_sa.get('snippet_ids', [])
            real_ids = []
            for sid in simple_ids:
                normalized = sid.upper() if isinstance(sid, str) else str(sid)
                if not normalized.startswith('S'):
                    normalized = f"S{normalized}"
                if normalized in id_mapping:
                    real_ids.append(id_mapping[normalized])

            if not real_ids:
                continue

            all_assigned_real_ids.update(real_ids)

            sa_dict = {
                "id": f"subarg-{uuid.uuid4().hex[:8]}",
                "argument_id": arg_id,
                "title": raw_sa.get('title', 'Evidence Group'),
                "purpose": raw_sa.get('purpose', ''),
                "relationship": raw_sa.get('relationship', f'Supports {prong_name}'),
                "snippet_ids": real_ids,
                "is_ai_generated": True,
                "status": "draft",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            sub_arguments.append(sa_dict)

        # Catch unassigned snippets
        all_real_ids = set(id_mapping.values())
        unassigned = all_real_ids - all_assigned_real_ids
        if unassigned:
            print(f"[NIW-v2] Prong {prong_key}: {len(unassigned)} unassigned snippets, adding catch-all")
            catch_all = {
                "id": f"subarg-{uuid.uuid4().hex[:8]}",
                "argument_id": arg_id,
                "title": "Additional Supporting Evidence",
                "purpose": "Supplementary evidence for this prong",
                "relationship": f"Additional support for {prong_name}",
                "snippet_ids": list(unassigned),
                "is_ai_generated": True,
                "status": "draft",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            sub_arguments.append(catch_all)
            all_assigned_real_ids.update(unassigned)

        # Build the LegalArgument
        all_snippet_ids = list(all_assigned_real_ids)
        sub_arg_ids = [sa["id"] for sa in sub_arguments]

        argument = LegalArgument(
            id=arg_id,
            standard=prong_key,
            title=f"{applicant_name}'s {prong_name}",
            rationale=f"Organized {len(prong_snippets)} evidence snippets into {len(sub_arguments)} sub-arguments for {prong_name}",
            snippet_ids=all_snippet_ids,
            evidence_strength="strong" if len(prong_snippets) >= 10 else "medium",
            sub_argument_ids=sub_arg_ids,
            subject=applicant_name,
        )

        print(f"[NIW-v2] Prong {prong_key}: {len(sub_arguments)} sub-args, "
              f"{len(all_snippet_ids)} snippets assigned")
        return argument, sub_arguments

    except Exception as e:
        print(f"[NIW-v2] Error organizing prong {prong_key}: {e}")
        # Fallback: single sub-argument
        all_ids = [snp.get('snippet_id', snp.get('id', '')) for snp in prong_snippets]
        sa_id = f"subarg-{uuid.uuid4().hex[:8]}"
        fallback_sa = {
            "id": sa_id,
            "argument_id": arg_id,
            "title": f"Evidence for {prong_name}",
            "purpose": f"All evidence supporting {prong_name}",
            "relationship": f"Supports {prong_name}",
            "snippet_ids": all_ids,
            "is_ai_generated": True,
            "status": "draft",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        argument = LegalArgument(
            id=arg_id,
            standard=prong_key,
            title=f"{applicant_name}'s {prong_name}",
            rationale=f"Fallback: all {len(prong_snippets)} snippets in one group",
            snippet_ids=all_ids,
            evidence_strength="medium",
            sub_argument_ids=[sa_id],
            subject=applicant_name,
        )
        return argument, [fallback_sa]


async def niw_organize_arguments_v2(
    snippets: List[Dict], applicant_name: str, provider: str = "deepseek",
    project_id: str = None
) -> Tuple[List[LegalArgument], List[Dict], List[Dict]]:
    """
    NIW v2: Top-down Dhanasar pickup + per-prong LLM organization.

    Two-step flow:
    1. Top-down pickup: LLM selects snippets for each Dhanasar prong (parallel, 3 prongs)
    2. Per-prong organization: parallel LLM calls organize each prong's snippets

    Returns:
        (arguments, sub_arguments, filtered_out)
    """
    print(f"[NIW-v2] Starting with {len(snippets)} total snippets")

    # Step 1: Top-down pickup — LLM selects per prong from full snippet pool
    print("[NIW-v2] Step 1: Top-down Dhanasar pickup...")
    try:
        prong_buckets = await _niw_group_snippets_by_prong_topdown(
            snippets, provider, project_id=project_id
        )
    except RuntimeError as e:
        # Fallback to rule-based if top-down fails completely
        print(f"[NIW-v2] Top-down pickup failed ({e}), falling back to rule-based mapping")
        prong_buckets = {
            "prong1_merit": [],
            "prong2_positioned": [],
            "prong3_balance": [],
        }
        for snp in snippets:
            if not snp.get('is_applicant_achievement', True):
                continue
            etype = snp.get('evidence_type', '').lower()
            mapped_prong = NIW_EVIDENCE_TYPE_MAPPING.get(etype)
            if mapped_prong and mapped_prong in prong_buckets:
                prong_buckets[mapped_prong].append(snp)
            else:
                prong_buckets['prong2_positioned'].append(snp)

    prong_counts = {k: len(v) for k, v in prong_buckets.items()}
    print(f"[NIW-v2] After pickup: {prong_counts}")

    # Step 2: Per-prong organization (parallel)
    print("[NIW-v2] Step 2: Organizing per prong...")
    filtered_out = []
    tasks = []
    active_prongs = []
    for prong_key, prong_snps in prong_buckets.items():
        if prong_snps:
            active_prongs.append(prong_key)
            tasks.append(niw_organize_per_prong(prong_key, prong_snps, applicant_name, provider))

    if not tasks:
        print("[NIW-v2] No snippets to organize!")
        return [], [], filtered_out

    results = await asyncio.gather(*tasks, return_exceptions=True)

    arguments = []
    all_sub_arguments = []

    for prong_key, result in zip(active_prongs, results):
        if isinstance(result, Exception):
            print(f"[NIW-v2] Prong {prong_key} failed: {result}")
            continue
        arg, sub_args = result
        arguments.append(arg)
        all_sub_arguments.extend(sub_args)

    # Coverage stats — count unique snippets across all prongs
    all_assigned_ids = set()
    for a in arguments:
        all_assigned_ids.update(a.snippet_ids)
    total_input = len(snippets)
    coverage = (len(all_assigned_ids) / total_input * 100) if total_input > 0 else 0
    print(f"[NIW-v2] Final: {len(arguments)} arguments, {len(all_sub_arguments)} sub-arguments")
    print(f"[NIW-v2] Coverage: {len(all_assigned_ids)}/{total_input} unique snippets ({coverage:.1f}%)")

    return arguments, all_sub_arguments, filtered_out



async def full_legal_pipeline(
    project_id: str,
    applicant_name: str = "the Applicant",
    provider: str = "deepseek",
    project_type: str = "EB-1A"
) -> Dict[str, Any]:
    """
    完整的法律论点组织流程

    Step 1: LLM + 法律条例 → 组织子论点
    Step 2: LLM → 划分次级子论点

    Returns:
        {
            "arguments": [...],
            "sub_arguments": [...],
            "filtered": [...],
            "stats": {...}
        }
    """
    from pathlib import Path

    # 加载 snippets
    projects_dir = Path(__file__).parent.parent.parent / "data" / "projects"
    project_dir = projects_dir / project_id

    combined_file = project_dir / "extraction" / "combined_extraction.json"
    enriched_file = project_dir / "enriched" / "enriched_snippets.json"
    if combined_file.exists():
        # Prefer combined extraction (same source as frontend API, consistent IDs)
        with open(combined_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        snippets = data.get('snippets', [])
    elif enriched_file.exists():
        with open(enriched_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        snippets = data.get('snippets', [])
    else:
        # Fallback to per-exhibit extraction files
        snippets = []
        extraction_dir = project_dir / "extraction"
        if extraction_dir.exists():
            for f in extraction_dir.glob("*_extraction.json"):
                if f.name == "combined_extraction.json":
                    continue
                with open(f, 'r', encoding='utf-8') as fp:
                    d = json.load(fp)
                    snippets.extend(d.get("snippets", []))

    print(f"[LegalPipeline] Loaded {len(snippets)} snippets")

    # Resolve project_type from storage if not provided
    if not project_type or project_type == "EB-1A":
        try:
            from .storage import get_project_type
            project_type = get_project_type(project_id)
        except Exception:
            project_type = "EB-1A"

    if project_type == "NIW":
        # NIW v2: top-down Dhanasar pickup + per-prong organize (one-step, no separate subdivide)
        print(f"\n[NIW-v2] Running NIW v2 pipeline...")
        arguments, all_sub_arguments, filtered = await niw_organize_arguments_v2(
            snippets, applicant_name, provider, project_id=project_id
        )
        print(f"[NIW-v2] Done: {len(arguments)} arguments, {len(all_sub_arguments)} sub-arguments")
    else:
        # EB-1A: original two-step flow
        # Step 1: 组织子论点
        print(f"\n[Step 1] Organizing arguments with {project_type} legal framework...")
        arguments, filtered = await organize_arguments_with_legal_framework(
            snippets, applicant_name, provider, project_type, project_id=project_id
        )

        print(f"[Step 1] Generated {len(arguments)} arguments")

        # Build snippet lookup
        snippet_map = {s.get('snippet_id', s.get('id', '')): s for s in snippets}

        # Step 2: 划分次级子论点
        print("\n[Step 2] Subdividing into sub-arguments...")
        all_sub_arguments = []

        from .subargument_generator import subdivide_argument

        for arg in arguments:
            # Get snippets for this argument
            arg_snippets = [snippet_map[sid] for sid in arg.snippet_ids if sid in snippet_map]

            if not arg_snippets:
                continue

            sub_args = await subdivide_argument(
                argument={'id': arg.id, 'title': arg.title, 'standard': arg.standard},
                snippets=arg_snippets,
                provider=provider
            )

            arg.sub_argument_ids = [sa.id for sa in sub_args]
            all_sub_arguments.extend([asdict(sa) for sa in sub_args])

            await asyncio.sleep(0.2)

        print(f"[Step 2] Generated {len(all_sub_arguments)} sub-arguments")

    # 统计
    by_standard = {}
    for arg in arguments:
        std = arg.standard
        by_standard[std] = by_standard.get(std, 0) + 1

    result = {
        "arguments": [a.to_dict() for a in arguments],
        "sub_arguments": all_sub_arguments,
        "filtered": filtered,
        "main_subject": applicant_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "argument_count": len(arguments),
            "sub_argument_count": len(all_sub_arguments),
            "by_standard": by_standard,
            "avg_subargs_per_arg": len(all_sub_arguments) / len(arguments) if arguments else 0
        }
    }

    # 保存结果
    output_file = project_dir / "arguments" / "legal_arguments.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n[LegalPipeline] Results saved to {output_file}")

    return result


async def regenerate_standard_pipeline(
    project_id: str,
    standard_key: str,
    applicant_name: str = "the Applicant",
    provider: str = "deepseek",
    project_type: str = "EB-1A"
) -> Dict[str, Any]:
    """
    按单个 standard 重新生成 Arguments + SubArguments，
    只替换该 standard 下的数据，其余保持不动。
    """
    from .snippet_recommender import load_legal_arguments, save_legal_arguments
    from .subargument_generator import subdivide_argument

    # --- 加载 snippets (复用 full_legal_pipeline 的逻辑) ---
    projects_dir = Path(__file__).parent.parent.parent / "data" / "projects"
    project_dir = projects_dir / project_id

    combined_file = project_dir / "extraction" / "combined_extraction.json"
    enriched_file = project_dir / "enriched" / "enriched_snippets.json"
    if combined_file.exists():
        with open(combined_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        snippets = data.get('snippets', [])
    elif enriched_file.exists():
        with open(enriched_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        snippets = data.get('snippets', [])
    else:
        snippets = []
        extraction_dir = project_dir / "extraction"
        if extraction_dir.exists():
            for f in extraction_dir.glob("*_extraction.json"):
                if f.name == "combined_extraction.json":
                    continue
                with open(f, 'r', encoding='utf-8') as fp:
                    d = json.load(fp)
                    snippets.extend(d.get("snippets", []))

    print(f"[RegenerateStandard] Loaded {len(snippets)} snippets, target standard: {standard_key}")

    # --- Resolve project_type ---
    if not project_type or project_type == "EB-1A":
        try:
            from .storage import get_project_type
            project_type = get_project_type(project_id)
        except Exception:
            project_type = "EB-1A"

    # --- 选择法律标准 ---
    if project_type == "NIW":
        legal_stds = NIW_LEGAL_STANDARDS
        evidence_mapping = NIW_EVIDENCE_TYPE_MAPPING
    elif project_type == "L-1A":
        legal_stds = L1A_LEGAL_STANDARDS
        evidence_mapping = L1A_EVIDENCE_TYPE_MAPPING
    else:
        legal_stds = LEGAL_STANDARDS
        evidence_mapping = None

    if standard_key not in legal_stds:
        return {
            "success": False,
            "error": f"Unknown standard_key '{standard_key}' for project_type '{project_type}'. "
                     f"Valid keys: {list(legal_stds.keys())}"
        }

    # --- 按 standard 分组，只取目标 standard ---
    if project_type == "EB-1A":
        # EB-1A: top-down pickup（单个 standard）
        std_info = legal_stds[standard_key]
        # leading_role/display 需要全量 snippet（含第三方对组织的描述）
        if standard_key in ("leading_role", "display"):
            pool = snippets
        else:
            pool = [s for s in snippets if s.get('is_applicant_achievement', True)]
        target_snippets = await _topdown_pickup_for_standard(
            standard_key, std_info, pool, provider
        )
    else:
        # NIW / L-1A: bottom-up 映射
        snippets_by_std = _group_snippets_by_standard(snippets, legal_stds, evidence_mapping)
        target_snippets = snippets_by_std.get(standard_key, [])

    if not target_snippets:
        return {
            "success": False,
            "error": f"No snippets found for standard '{standard_key}'. "
                     f"Check that snippets have matching evidence_type."
        }

    print(f"[RegenerateStandard] Found {len(target_snippets)} snippets for '{standard_key}'")

    if project_type == "NIW":
        # NIW v2: use per-prong organizer directly (includes sub-argument generation)
        argument, all_sub_arguments = await niw_organize_per_prong(
            standard_key, target_snippets, applicant_name, provider
        )
        arguments = [argument]
        print(f"[RegenerateStandard] NIW v2: {len(all_sub_arguments)} sub-arguments")
    else:
        # EB-1A: original two-step flow
        # --- Step 1: organize arguments (仅含该 standard 的 snippets) ---
        arguments, filtered = await organize_arguments_with_legal_framework(
            target_snippets, applicant_name, provider, project_type
        )
        print(f"[RegenerateStandard] Step 1: generated {len(arguments)} arguments")

        # --- Step 2: subdivide into sub-arguments ---
        snippet_map = {s.get('snippet_id', s.get('id', '')): s for s in snippets}
        all_sub_arguments = []

        for arg in arguments:
            arg_snippets = [snippet_map[sid] for sid in arg.snippet_ids if sid in snippet_map]
            if not arg_snippets:
                continue

            sub_args = await subdivide_argument(
                argument={'id': arg.id, 'title': arg.title, 'standard': arg.standard},
                snippets=arg_snippets,
                provider=provider
            )

            arg.sub_argument_ids = [sa.id for sa in sub_args]
            all_sub_arguments.extend([asdict(sa) for sa in sub_args])
            await asyncio.sleep(0.2)

        print(f"[RegenerateStandard] Step 2: generated {len(all_sub_arguments)} sub-arguments")

    new_arguments = [a.to_dict() for a in arguments]

    # --- 合并到现有 legal_arguments.json ---
    existing = load_legal_arguments(project_id)

    # 删除旧的该 standard 下的 arguments 和关联的 sub_arguments
    old_arg_ids = {
        a["id"] for a in existing.get("arguments", [])
        if (a.get("standard_key") or a.get("standard")) == standard_key
    }
    existing["arguments"] = [
        a for a in existing.get("arguments", [])
        if a["id"] not in old_arg_ids
    ]
    existing["sub_arguments"] = [
        sa for sa in existing.get("sub_arguments", [])
        if sa.get("argument_id") not in old_arg_ids
    ]

    # 插入新的
    existing["arguments"].extend(new_arguments)
    existing["sub_arguments"].extend(all_sub_arguments)

    # 更新 stats
    by_standard = {}
    for a in existing["arguments"]:
        std = a.get("standard_key") or a.get("standard", "")
        by_standard[std] = by_standard.get(std, 0) + 1
    existing.setdefault("stats", {})["by_standard"] = by_standard
    existing["stats"]["argument_count"] = len(existing["arguments"])
    existing["stats"]["sub_argument_count"] = len(existing["sub_arguments"])

    save_legal_arguments(project_id, existing)
    print(f"[RegenerateStandard] Merged and saved. Removed {len(old_arg_ids)} old args, added {len(new_arguments)} new args.")

    return {
        "success": True,
        "standard_key": standard_key,
        "old_argument_ids": list(old_arg_ids),
        "new_arguments": new_arguments,
        "new_sub_arguments": all_sub_arguments,
        "stats": {
            "old_count": len(old_arg_ids),
            "new_argument_count": len(new_arguments),
            "new_sub_argument_count": len(all_sub_arguments),
            "total_arguments": len(existing["arguments"]),
            "by_standard": by_standard,
        }
    }
