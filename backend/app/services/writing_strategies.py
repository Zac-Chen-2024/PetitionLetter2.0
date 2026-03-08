"""
Writing Strategies — per-standard configuration for the petition writing pipeline.

Centralizes all project_type / standard_key branching into a single lookup layer.
petition_writer_v3.py consumes WritingStrategy objects instead of scattering
if/else blocks throughout the code.

Supports: EB-1A (10 criteria), NIW (3 Dhanasar prongs), L-1A (4 standards).
Extensible to EB-2, O-1A, etc. by adding new strategy entries.
"""

from dataclasses import dataclass
from typing import Dict, Optional, Tuple


@dataclass(frozen=True)
class WritingStrategy:
    project_type: str
    standard_key: str
    legal_ref: str
    step1_base_system_prompt: str        # shared base system prompt
    step1_argumentation_appendix: str    # per-standard appendix added after base
    step1_instruction_block: str         # user-prompt instruction block
    sentence_range: Tuple[int, int]      # (min, max) sentences per sub-argument
    polish_single_subarg: bool           # Step 2: polish even when only 1 sub-arg?
    frame_system_prompt: str             # Step 3: opening/closing system prompt
    cross_section_context: bool          # build cross-section context (NIW prong3)


# ============================================================
# Base system prompts (defined once, shared across standards)
# ============================================================

_EB1A_BASE_SYSTEM_PROMPT = """\
You are a Senior Immigration Attorney at a top-tier law firm drafting an EB-1A petition letter.

ARGUMENTATION METHOD — For each piece of evidence, build a COMPLETE argument chain:
1. FACT: State what the applicant did / what happened (cite Exhibit)
2. AUTHORITY: Prove the organization/award/journal is prestigious — state WHO runs it, WHEN it was founded, and WHY it is recognized (cite Exhibit)
3. RIGOR: Describe the evaluation/selection process — how are candidates nominated, who reviews, what criteria are used (cite Exhibit)
4. SCALE/RARITY: Provide numbers — how many applied/competed, how few won, compute percentages when both numerator and denominator are available (cite Exhibit)
5. PEER COMPARISON: Name specific co-recipients, fellow members, or past winners mentioned in the source materials to show the caliber of the peer group (cite Exhibit). Use ONLY names found in source materials.

Not every evidence needs all 5 layers, but the strongest arguments have most of them.

DEFENSIVE ARGUMENTATION: If any evidence could be perceived as a weakness (e.g., a lower prize tier, a regional rather than international scope), proactively address it by contextualizing — explain the award structure, the total number of tiers, and what percentage of candidates reach that tier. Do NOT ignore potential weaknesses; reframe them as strengths using facts from the source materials.

ABSOLUTE RULES:
1. Every fact MUST come from the SOURCE MATERIALS below. NEVER invent facts.
2. Extract ALL relevant numbers, dates, names, and statistics from the source materials.
3. Write in THIRD PERSON about "the Beneficiary".
4. Each sentence must cite [Exhibit X, p.Y] in the text AND include the matching \
snippet_id(s) from the SNIPPET INDEX in the JSON snippet_ids array. Pick the \
MOST RELEVANT block(s) — do NOT include all blocks on the page.
5. Professional legal argumentative tone, 100% English."""

_NIW_BASE_SYSTEM_PROMPT = """\
You are a Senior Immigration Attorney drafting a National Interest Waiver (NIW) petition letter under Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016).

ARGUMENTATION METHOD — For each Dhanasar prong, build a COMPLETE argument chain:

Prong 1 (Substantial Merit & National Importance):
  1. ENDEAVOR: Define the proposed endeavor clearly and precisely
  2. MERIT: Show substantial merit with concrete evidence (innovation, societal benefit)
  3. NATIONAL SCOPE: Prove national importance beyond regional impact — cite statistics, policy relevance, or broad applicability

Prong 2 (Well Positioned to Advance):
  1. QUALIFICATIONS: Education, expertise, specialized training
  2. TRACK RECORD: Publications, citations, prior achievements demonstrating ability
  3. PROGRESS: What has already been accomplished toward the endeavor
  4. PLAN: Concrete plans and resources to advance the endeavor further

Prong 3 (Balance of Equities — Waiver Justification):
  1. NATIONAL BENEFIT: How the US benefits from waiving labor certification
  2. BEYOND EMPLOYER: Work transcends any single employer's interests
  3. URGENCY: Time-sensitive need that labor certification would delay (if applicable)
  4. SELF-DIRECTION: Applicant's work requires autonomy that employer-based sponsorship would constrain

Not every evidence needs all layers, but the strongest arguments have most of them.

ABSOLUTE RULES:
1. Every fact MUST come from the SOURCE MATERIALS below. NEVER invent facts.
2. Extract ALL relevant numbers, dates, names, and statistics from the source materials.
3. Write in THIRD PERSON about "the Beneficiary".
4. Each sentence must cite [Exhibit X, p.Y] in the text AND include the matching \
snippet_id(s) from the SNIPPET INDEX in the JSON snippet_ids array. Pick the \
MOST RELEVANT block(s) — do NOT include all blocks on the page.
5. Professional legal argumentative tone, 100% English."""


# ============================================================
# Step 3 frame system prompts
# ============================================================

_EB1A_FRAME_SYSTEM_PROMPT = (
    "You are a Senior Immigration Attorney writing an EB-1A petition letter."
)
_NIW_FRAME_SYSTEM_PROMPT = (
    "You are a Senior Immigration Attorney writing an NIW petition letter "
    "under Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016)."
)


# ============================================================
# Shared instruction tail (appended to every step1 instruction block)
# ============================================================

_INSTRUCTION_TAIL = (
    '- The "Key evidence pointers" highlight the most important evidence, but you SHOULD\n'
    "  also extract additional supporting details from the source materials (numbers,\n"
    "  evaluation criteria, peer names, organization credentials, etc.)\n"
    "- Every sentence must cite [Exhibit X, p.Y] in text AND include matching snippet_ids\n"
    "  from the SNIPPET INDEX. Choose the specific block(s) whose content you actually used.\n"
    "- Use exact numbers and names from the source materials\n"
    "- Professional legal tone, 100% English (translate any non-English source text)\n"
    "- Do NOT copy source text verbatim — ARGUE: state a legal point, then cite supporting evidence"
)


def _eb1a_instruction(chain: str, sentence_range: Tuple[int, int]) -> str:
    lo, hi = sentence_range
    return (
        f"INSTRUCTIONS:\n"
        f"- Write one paragraph ({lo}-{hi} sentences) per Sub-Argument listed above\n"
        f"- ARGUMENTATION CHAIN: {chain}\n"
        f"- PERSON NAMING (MANDATORY): When the source materials name a person, you MUST use\n"
        f"  their FULL NAME with a title prefix (Dr., Prof., Mr., Ms., Director, Chairman,\n"
        f"  Vice President, etc.) and write 2-3 sentences about their credentials, title, and\n"
        f"  affiliation. NEVER replace a named person with a generic label like 'an expert'\n"
        f"  or 'a researcher'. Example: 'Dr. Qiji Ma, a Researcher at the China National\n"
        f"  Institute of Advertising, is one of the earliest market research practitioners\n"
        f"  in mainland China.'\n"
        f"- VERBATIM QUOTING (MANDATORY): When source materials contain charter text, bylaw\n"
        f"  provisions, official criteria, or recommendation letter assessments, QUOTE the\n"
        f"  exact words using quotation marks. Example: The Charter states: \"candidates must\n"
        f"  demonstrate exceptional contributions to the field.\"\n"
        f"{_INSTRUCTION_TAIL}"
    )


def _niw_instruction(chain: str, sentence_range: Tuple[int, int], standard_key: str = "") -> str:
    lo, hi = sentence_range
    prong3_rules = ""
    if standard_key == "prong3_balance":
        prong3_rules = (
            "- CROSS-PRONG REFRAMING (MANDATORY): Reference at least 3 specific\n"
            "  accomplishments from Prongs 1 and 2 in your waiver argument. REFRAME each\n"
            "  as evidence for why labor certification is impractical or contrary to\n"
            "  national interest — do NOT simply restate them.\n"
            "- POLICY ARGUMENT STRUCTURE: Each paragraph must make a legal CONCLUSION\n"
            "  about why waiver is justified, then support it with facts. Do NOT write\n"
            "  a narrative of accomplishments.\n"
            "- BALANCING LANGUAGE (MANDATORY): Include explicit legal balancing phrases:\n"
            "  'on balance', 'the national interest outweighs', etc.\n"
        )
    return (
        f"INSTRUCTIONS:\n"
        f"{chain}\n"
        f"- Write one paragraph ({lo}-{hi} sentences) per Sub-Argument listed above\n"
        f"{prong3_rules}"
        f"{_INSTRUCTION_TAIL}"
    )


# ============================================================
# NIW per-prong argumentation appendices
# ============================================================

_NIW_APPENDICES: Dict[str, str] = {
    "prong3_balance": (
        "\nPRONG 3 — WAIVER JUSTIFICATION [Matter of Dhanasar, Prong 3]:\n\n"
        "STRUCTURE: Build a comprehensive waiver argument with ALL of the following components:\n\n"
        "COMPONENT A — IMPRACTICALITY OF LABOR CERTIFICATION (MANDATORY):\n"
        "  Explain why the PERM labor certification process is unsuitable for this\n"
        "  beneficiary's proposed endeavor. Focus on: (1) the nature of the work requires\n"
        "  flexibility, multi-institutional collaboration, or self-direction that an\n"
        "  employer-specific PERM would constrain; (2) the PERM process's employer-tied\n"
        "  structure conflicts with the cross-cutting nature of the work; (3) specific\n"
        "  time delays from PERM would meaningfully hinder progress on the endeavor.\n"
        "  Use facts from the SOURCE MATERIALS about the beneficiary's planned work.\n\n"
        "COMPONENT B — NATIONAL BENEFIT ANALYSIS (MANDATORY):\n"
        "  Articulate concrete national benefits from the beneficiary's specific\n"
        "  contributions — do NOT make generic field-level claims. Connect to specific\n"
        "  government priorities, strategic initiatives, or policy goals mentioned in\n"
        "  the source materials. Where available, cite quantitative impact: jobs created,\n"
        "  revenue generated, efficiency improvements, or populations served. Argue that\n"
        "  these benefits exist even if other qualified U.S. workers are available.\n\n"
        "COMPONENT C — BEYOND SINGLE EMPLOYER (MANDATORY):\n"
        "  Demonstrate that the beneficiary's work transcends any single employer's\n"
        "  interests. Evidence: multi-institutional collaborations, standards-setting,\n"
        "  open research/publications, industry-wide impact, consulting across orgs.\n"
        "  If CROSS-PRONG CONTEXT shows such activities, reference them here WITHOUT\n"
        "  fabricating exhibit citations.\n\n"
        "COMPONENT D — URGENCY / TIME-SENSITIVITY (IF APPLICABLE):\n"
        "  If source materials mention specific timelines, appointments, grant deadlines,\n"
        "  or competitive landscapes, argue that delays from labor certification would\n"
        "  create meaningful disadvantage. Omit if no time-sensitive evidence exists.\n\n"
        "COMPONENT E — EXPLICIT BALANCING (MANDATORY — must be FINAL component):\n"
        "  Explicitly weigh national interest against labor market protection. Use legal\n"
        "  balancing language: 'on balance', 'the national interest in [X] outweighs the\n"
        "  purpose of the labor certification requirement'. Connect back to Prong 1 and 2\n"
        "  accomplishments. Conclude with clear waiver justification.\n\n"
        "CROSS-PRONG REFRAMING TECHNIQUE:\n"
        "  Prong 3 is a POLICY argument, not merely an evidence-listing exercise. REFRAME\n"
        "  accomplishments from Prongs 1 and 2 through a waiver justification lens. Do not\n"
        "  simply restate them — explain WHY each accomplishment makes labor certification\n"
        "  impractical or contrary to the national interest."
    ),
}


# ============================================================
# EB-1A per-criterion argumentation appendices
# ============================================================

_EB1A_APPENDICES: Dict[str, str] = {
    "awards": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — Awards [8 C.F.R. §204.5(h)(3)(i)]:\n\n"
        "CRITICAL — PERSON NAMING RULES (apply throughout this section):\n"
        "  - Every time you reference a person from the source materials, use their FULL NAME\n"
        "    with a professional title prefix: Dr., Prof., Mr., Ms., Director, Chairman, etc.\n"
        "    Example: 'Dr. Qiji Ma, a Researcher at the China National Institute of Advertising'\n"
        "    NEVER write 'a researcher' or 'an expert' when the source materials provide a name.\n"
        "  - When naming committee members, judges, or reviewers, always include their title,\n"
        "    institutional affiliation, and role. Example: 'Prof. Shyam Sundar, founder of the\n"
        "    Media Effects Research Laboratory at Penn State University'\n\n"
        "STRUCTURE: Write one section per award. Each section must contain ALL of the following paragraphs:\n\n"
        "PARAGRAPH 1 — GRANTING BODY BACKGROUND:\n"
        "  Identify the organization that grants the award. State its founding year, governance\n"
        "  structure, and mission. Explain why this body is authoritative in the field. If the\n"
        "  organization is government-affiliated, chartered, or internationally recognized,\n"
        "  state that explicitly with supporting details from the source materials.\n\n"
        "PARAGRAPH 2 — SELECTION CRITERIA AND PROCESS:\n"
        "  Describe the nomination and selection process step by step. If the source materials\n"
        "  contain charter articles, bylaws, or official rules governing the award, QUOTE the\n"
        "  relevant text VERBATIM using quotation marks (e.g., 'The Charter states: \"candidates\n"
        "  must demonstrate exceptional contributions...\"'). Identify who serves on the\n"
        "  selection committee by name, title, and credentials. Explain what criteria\n"
        "  distinguish winners from nominees.\n\n"
        "PARAGRAPH 3 — QUANTITATIVE SELECTIVITY:\n"
        "  Provide the total number of nominees, applicants, or competitors and the number\n"
        "  of winners. COMPUTE the acceptance rate as a percentage (e.g., '15 out of 648\n"
        "  nominees were selected, representing an acceptance rate of approximately 2.3%').\n"
        "  If multi-year data is available, aggregate it. If only partial data is available,\n"
        "  state what is known and note the implied selectivity.\n\n"
        "PARAGRAPH 4 — CO-RECIPIENT CALIBER (MANDATORY — do NOT skip):\n"
        "  Write a SEPARATE mini-paragraph for EACH co-recipient, past winner, or fellow\n"
        "  honoree found in the source materials. For each person, write 3-5 sentences:\n"
        "  (1) Full name with title and current position,\n"
        "  (2) Their institutional affiliation and role,\n"
        "  (3) Their key achievements or credentials that show their stature.\n"
        "  Example: 'Dr. Qiji Ma, a highly regarded figure in market research, holds the\n"
        "  distinguished position of Researcher at the China National Institute of Advertising.\n"
        "  As one of the earliest practitioners of market research in mainland China and among\n"
        "  the first registered consultants in the nation, Dr. Ma also received the \"Data\n"
        "  Legacy of the Year Award.\"'\n"
        "  This paragraph demonstrates the Beneficiary is recognized alongside established\n"
        "  leaders in the field. If no co-recipients are named in source materials, state that\n"
        "  explicitly rather than omitting the paragraph.\n\n"
        "CLOSING: Tie back to the regulatory standard — explain how this award constitutes\n"
        "  documentation of nationally or internationally recognized prizes or awards for\n"
        "  excellence in the field of endeavor."
    ),
    "membership": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — Membership [8 C.F.R. §204.5(h)(3)(ii)]:\n\n"
        "CRITICAL — PERSON NAMING RULES (apply throughout this section):\n"
        "  - Every time you reference a person from the source materials, use their FULL NAME\n"
        "    with a professional title prefix: Dr., Prof., Mr., Ms., Director, Chairman, etc.\n"
        "    NEVER write 'a reviewer' or 'an official' when the source materials provide a name.\n"
        "  - When naming reviewers, board members, or co-members, always include their title,\n"
        "    institutional affiliation, and role.\n\n"
        "STRUCTURE: Write one section per association. Each section must contain ALL of the following paragraphs:\n\n"
        "PARAGRAPH 1 — ASSOCIATION BACKGROUND:\n"
        "  State the association's full name, founding year, headquarters, and mission.\n"
        "  Describe its role in the field — is it the primary credentialing body, a\n"
        "  professional society, or an honorary organization? State total membership count\n"
        "  if available. If it has government recognition or accreditation, state that.\n\n"
        "PARAGRAPH 2 — ADMISSION REQUIREMENTS (OUTSTANDING ACHIEVEMENTS):\n"
        "  QUOTE the association's charter, bylaws, or membership criteria VERBATIM using\n"
        "  quotation marks. Include article/section numbers when available (e.g., 'The\n"
        "  Membership Certificate Letter states: \"An individual member should have been\n"
        "  engaged in the industry for more than 10 years or be a senior practitioner...\"').\n"
        "  Walk through the admission process step by step: application submission,\n"
        "  documentation requirements, review committee evaluation, board vote.\n\n"
        "PARAGRAPH 3 — EXPERT JUDGMENT IN SELECTION:\n"
        "  Identify who evaluates membership applications BY NAME — state each reviewer's\n"
        "  full name, title, and credentials (e.g., 'Ms. Chong Peng, Vice President of\n"
        "  the Association and General Manager of Shanghai Donnor Exhibition Service Co.\n"
        "  Ltd.'). Explain how their expertise qualifies them to judge outstanding\n"
        "  achievements in the field.\n\n"
        "PARAGRAPH 4 — CO-MEMBER CALIBER (MANDATORY — do NOT skip):\n"
        "  Write a SEPARATE mini-paragraph for EACH notable co-member found in the source\n"
        "  materials. For each person, write 3-5 sentences:\n"
        "  (1) Full name with title and current position,\n"
        "  (2) Their key achievements (awards, championships, positions held),\n"
        "  (3) How their credentials demonstrate the association's elite membership.\n"
        "  Example: 'Ms. Ping Zhang, a distinguished member of the Association, won the\n"
        "  first gold medal in the Asian Bodybuilding and Fitness Championship and received\n"
        "  the Fitness China Awards \"Ten Figures\" in 2017. She also served as the coach of\n"
        "  China's national bodybuilding team.'\n"
        "  If no co-members are named in source materials, state that explicitly.\n\n"
        "CLOSING: Tie back to the regulatory standard — demonstrate that membership\n"
        "  requires outstanding achievements as judged by recognized national or\n"
        "  international experts in the field."
    ),
    "published": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — Published Material [8 C.F.R. §204.5(h)(3)(iii)]:\n\n"
        "CRITICAL — PERSON NAMING RULES (apply throughout this section):\n"
        "  - When naming article authors, editors, or experts quoted in the article, use\n"
        "    their FULL NAME with title prefix: Dr., Prof., Mr., Ms., etc.\n"
        "  - When naming editorial board members, fellowship committee members, or other\n"
        "    persons who validate the publication's prestige, include their full credentials.\n"
        "    Example: 'Prof. Bao Cunkuan of Fudan University serves on the Steering\n"
        "    Committee of the Sixth Tone Fellowship program.'\n\n"
        "STRUCTURE: Write one section per publication. Each section must contain ALL of the following paragraphs:\n\n"
        "PARAGRAPH 1 — PUBLICATION BACKGROUND AND PRESTIGE:\n"
        "  State the publication's full name, founding year, publisher/owner, and\n"
        "  circulation figures or readership data. Identify the type of publication\n"
        "  (newspaper, professional journal, trade magazine, online platform). If\n"
        "  circulation data is sourced from an authority (e.g., Library of Congress,\n"
        "  Ulrich's, press association records), cite that authority BY NAME. Mention\n"
        "  any press awards the publication itself has received, naming the award.\n\n"
        "PARAGRAPH 2 — EDITORIAL INDEPENDENCE AND STANDARDS:\n"
        "  Explain the editorial process — does the publication have an independent\n"
        "  editorial board? Name board members if found in source materials. Is content\n"
        "  peer-reviewed, editor-selected, or staff-written? If the publication has\n"
        "  fellowship programs or oversight committees, name the members with their\n"
        "  credentials. This establishes that the coverage was not self-promotional.\n\n"
        "PARAGRAPH 3 — COVERAGE SCOPE AND CONTENT:\n"
        "  Describe what the published material covers about the Beneficiary. Prove\n"
        "  that it is ABOUT the Beneficiary and their work (not merely a passing\n"
        "  mention). QUOTE specific passages from the article using quotation marks\n"
        "  to demonstrate substantive coverage of the Beneficiary's achievements.\n\n"
        "CLOSING: Tie back to the regulatory standard — establish that this constitutes\n"
        "  published material about the Beneficiary in professional or major trade\n"
        "  publications or other major media, relating to the Beneficiary's work in\n"
        "  the field."
    ),
    "judging": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — Judging [8 C.F.R. §204.5(h)(3)(iv)]:\n\n"
        "CRITICAL — PERSON NAMING RULES (apply throughout this section):\n"
        "  - Every time you reference a person from the source materials, use their FULL NAME\n"
        "    with a professional title prefix: Dr., Prof., Mr., Ms., Director, Chairman, etc.\n"
        "    NEVER write 'a judge' or 'an expert' when the source materials provide a name.\n"
        "  - When naming fellow judges, committee chairs, or panelists, always include their\n"
        "    title, institutional affiliation, and role.\n\n"
        "STRUCTURE: Write one section per judging role. Each section must contain ALL of the following paragraphs:\n\n"
        "PARAGRAPH 1 — ORGANIZATION AND EVENT BACKGROUND:\n"
        "  Identify the organization, competition, journal, or body for which the\n"
        "  Beneficiary served as a judge. State its founding, scope (national/\n"
        "  international), and reputation in the field. Provide the Beneficiary's\n"
        "  exact title or role — use specific titles found in source materials\n"
        "  (e.g., 'Deputy Director of the Judging Panel' rather than generic 'judge').\n\n"
        "PARAGRAPH 2 — SELECTION AS JUDGE:\n"
        "  Explain how the Beneficiary was selected or invited to serve as a judge.\n"
        "  Was it by appointment, election, invitation from a committee? What\n"
        "  qualifications or expertise were required? This shows the Beneficiary\n"
        "  was chosen based on recognized expertise.\n\n"
        "PARAGRAPH 3 — SCOPE AND SCALE OF JUDGING:\n"
        "  Quantify the judging responsibilities: how many submissions, applications,\n"
        "  manuscripts, or entries did the Beneficiary evaluate? Over what time period?\n"
        "  State the decision weight if available (e.g., 'the panel's recommendations\n"
        "  carried 80% weightage in final decisions'). Describe the evaluation criteria\n"
        "  and methodology used.\n\n"
        "PARAGRAPH 4 — CO-JUDGE CREDENTIALS AND IMPACT (MANDATORY — do NOT skip):\n"
        "  Write a SEPARATE mini-paragraph for EACH fellow judge found in the source\n"
        "  materials. For each person, write 2-3 sentences:\n"
        "  (1) Full name with title and current position,\n"
        "  (2) Their institutional affiliation and credentials,\n"
        "  (3) What their presence on the panel demonstrates about its prestige.\n"
        "  Then describe the impact of the judging decisions — what happened to\n"
        "  winners/selectees? This shows the Beneficiary's judgments shaped outcomes.\n\n"
        "CLOSING: Tie back to the regulatory standard — demonstrate participation\n"
        "  as a judge of the work of others in the same or an allied field."
    ),
    "contribution": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — Original Contribution [8 C.F.R. §204.5(h)(3)(v)]:\n\n"
        "CRITICAL — PERSON NAMING RULES (apply throughout this section):\n"
        "  - Every time you reference a person from the source materials, use their FULL NAME\n"
        "    with a professional title prefix: Dr., Prof., Mr., Ms., Director, Chairman, etc.\n"
        "    NEVER write 'an expert' or 'a trainee' when the source materials provide a name.\n"
        "  - For recommendation letter writers and endorsers, always state: full name, title,\n"
        "    affiliation, and then QUOTE their specific assessment in quotation marks.\n"
        "    Example: 'Dr. Bangchang Xie, Vice President of Fu Jen Catholic University,\n"
        "    stated in his recommendation letter: \"Professor Liu has actively contributed\n"
        "    to the establishment of academic communities...\"'\n\n"
        "STRUCTURE: Write one section per contribution. Each section must contain ALL of the following paragraphs:\n\n"
        "PARAGRAPH 1 — TECHNICAL DESCRIPTION OF THE CONTRIBUTION:\n"
        "  Describe the innovation, methodology, system, or technique the Beneficiary\n"
        "  developed. Explain what problem it solves and how it differs from prior\n"
        "  approaches. Use specific technical details from the source materials —\n"
        "  algorithms, architectures, formulations, or design principles.\n\n"
        "PARAGRAPH 2 — ADOPTION AND COMMERCIALIZATION:\n"
        "  Provide concrete evidence of real-world adoption. Include quantitative data:\n"
        "  page views, downloads, orders, revenue, user counts, or deployment scale.\n"
        "  If the contribution was commercialized into a product or service, describe\n"
        "  the market impact with specific numbers from the source materials.\n\n"
        "PARAGRAPH 3 — NAMED BENEFICIARIES AND DOWNSTREAM OUTCOMES (MANDATORY):\n"
        "  Write a SEPARATE mini-paragraph for EACH individual who benefited from the\n"
        "  contribution, as found in the source materials. For each person:\n"
        "  (1) Full name with title (Mr./Ms./Dr.),\n"
        "  (2) Their background (nationality, role, affiliation),\n"
        "  (3) The specific outcome they achieved (e.g., 'was selected as a national\n"
        "  weightlifting athlete', 'published a cover paper in Nature').\n"
        "  If recommendation letters describe individual beneficiaries, QUOTE the\n"
        "  relevant testimony in quotation marks.\n\n"
        "PARAGRAPH 4 — EXPERT ENDORSEMENT AND INDEPENDENT VALIDATION (MANDATORY):\n"
        "  Write a SEPARATE mini-paragraph for EACH expert who endorses the contribution.\n"
        "  For each expert: state full name, title, affiliation, then QUOTE their specific\n"
        "  assessment VERBATIM in quotation marks from the source materials. Do NOT\n"
        "  summarize — use the expert's own words wherever possible.\n\n"
        "PARAGRAPH 5 — FIELD-WIDE SIGNIFICANCE:\n"
        "  Explain how the contribution has changed or advanced the field as a whole.\n"
        "  Connect to citations, follow-on research, industry standards, or policy\n"
        "  changes. Argue that the contribution is of MAJOR SIGNIFICANCE, not merely\n"
        "  incremental improvement.\n\n"
        "CLOSING: Tie back to the regulatory standard — demonstrate original\n"
        "  scientific, scholarly, artistic, athletic, or business-related\n"
        "  contributions of major significance to the field."
    ),
    "scholarly": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — Scholarly Articles [8 C.F.R. §204.5(h)(3)(vi)]:\n\n"
        "CRITICAL — PERSON NAMING RULES (apply throughout this section):\n"
        "  - Every time you reference a person from the source materials, use their FULL NAME\n"
        "    with a professional title prefix: Dr., Prof., Mr., Ms., etc.\n"
        "  - When citing recommendation letter writers who comment on scholarly work, state:\n"
        "    full name, title, affiliation, then QUOTE their specific assessment VERBATIM.\n"
        "    Example: 'Dr. Lingfei Wu, Assistant Professor at the University of Pittsburgh,\n"
        "    stated: \"the paper has been cited 59 times, placing it in the top 10% of papers\n"
        "    published in the journal over the past fifteen years.\"'\n\n"
        "STRUCTURE: Write one section per publication venue or article cluster. Each section must contain ALL of the following paragraphs:\n\n"
        "PARAGRAPH 1 — JOURNAL/PUBLISHER PRESTIGE:\n"
        "  Identify the journal or publisher. State its publisher (e.g., Elsevier,\n"
        "  Springer, IEEE), founding year, and scope. Provide the Impact Factor,\n"
        "  CiteScore, or other ranking metrics. State the journal's rank within its\n"
        "  subject category (e.g., 'ranked #3 of 87 journals in Sports Science').\n"
        "  Describe the peer review process and acceptance rate if available.\n\n"
        "PARAGRAPH 2 — CITATION METRICS AND PERCENTILE:\n"
        "  State the Beneficiary's total citation count, h-index, or i10-index if\n"
        "  available. COMPUTE the citation percentile by comparing against field\n"
        "  averages (e.g., 'the Beneficiary's 245 citations place her in the top\n"
        "  10% of researchers in the field over a 15-year period'). Use specific\n"
        "  numbers and timeframes from the source materials. If cross-disciplinary\n"
        "  citations exist, highlight them.\n\n"
        "PARAGRAPH 3 — ARTICLE IMPACT AND RECOMMENDATION LETTER QUOTES (MANDATORY):\n"
        "  For key articles, describe their specific impact. If recommendation letters\n"
        "  reference specific publications, write a SEPARATE mini-paragraph for EACH\n"
        "  letter writer: state their full name, title, and affiliation, then QUOTE\n"
        "  their assessment VERBATIM in quotation marks. Do NOT summarize — use the\n"
        "  letter writer's own words. Note any best paper awards or special recognition.\n\n"
        "PARAGRAPH 4 — BREADTH AND INFLUENCE:\n"
        "  Show that the scholarly work reaches beyond a narrow sub-specialty.\n"
        "  Identify different fields or disciplines that have cited or adopted the\n"
        "  Beneficiary's work. If the articles have been cited in patents, policy\n"
        "  documents, or textbooks, note that as evidence of broader influence.\n\n"
        "CLOSING: Tie back to the regulatory standard — demonstrate authorship\n"
        "  of scholarly articles in professional or major trade publications or\n"
        "  other major media in the field."
    ),
    "display": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — Display / Exhibitions [8 C.F.R. §204.5(h)(3)(vii)]:\n"
        "For each exhibition, build this chain:\n"
        "  venue prestige & reputation → curatorial selection process → "
        "audience reach & attendance → critical reception\n"
        "Evidence of display of the Beneficiary's work at artistic exhibitions or showcases."
    ),
    "leading": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — Leading/Critical Role [8 C.F.R. §204.5(h)(3)(viii)]:\n\n"
        "CRITICAL — PERSON NAMING RULES (apply throughout this section):\n"
        "  - Every time you reference a person from the source materials, use their FULL NAME\n"
        "    with a professional title prefix: Dr., Prof., Mr., Ms., Director, Dean, etc.\n"
        "    NEVER write 'a colleague' or 'a student' when the source materials provide a name.\n"
        "  - For recommendation letter writers, ALWAYS state: full name, title, affiliation,\n"
        "    then QUOTE their specific assessment VERBATIM in quotation marks.\n"
        "  - For mentees, team members, or subordinates who achieved notable outcomes, use\n"
        "    their full name and describe the outcome in detail.\n\n"
        "STRUCTURE: Write one section per role. Each section must contain ALL of the following paragraphs:\n\n"
        "PARAGRAPH 1 — INSTITUTION/ORGANIZATION BACKGROUND:\n"
        "  State the organization's full name, founding date, and government\n"
        "  recognition or accreditation. If available, provide its credit rating,\n"
        "  ranking, or other third-party validation of its distinguished reputation.\n"
        "  Describe its mission, scale (number of employees, members, or students),\n"
        "  and significance within the field. If the organization is endorsed by\n"
        "  government agencies or professional associations, QUOTE those\n"
        "  endorsements VERBATIM from source materials.\n\n"
        "PARAGRAPH 2 — ROLE TITLE AND SPECIFIC DUTIES:\n"
        "  State the Beneficiary's exact title and reporting structure. Enumerate\n"
        "  specific duties and responsibilities — do not use vague language like\n"
        "  'oversaw operations'. Instead, list concrete actions: 'designed the\n"
        "  national training curriculum', 'managed a team of 15 coaches',\n"
        "  'allocated an annual budget of $2.3 million'. Use details from the\n"
        "  source materials.\n\n"
        "PARAGRAPH 3 — QUANTIFIED IMPACT AND OUTCOMES (MANDATORY):\n"
        "  Provide measurable results of the Beneficiary's leadership. Include\n"
        "  monetary amounts (with currency conversion if applicable), participant\n"
        "  counts, performance improvements, revenue growth. For mentees or team\n"
        "  members who achieved notable outcomes, write a SEPARATE mini-paragraph\n"
        "  for EACH person: full name, their achievement (e.g., 'Dr. Lingfei Wu,\n"
        "  now at the University of Pittsburgh, published a cover paper in the\n"
        "  February 21, 2019 issue of Nature'), and how the Beneficiary's\n"
        "  leadership contributed to that outcome.\n\n"
        "PARAGRAPH 4 — DECISION-MAKING AUTHORITY AND ORGANIZATIONAL DEPENDENCE:\n"
        "  Demonstrate that the role was LEADING (directing others) or CRITICAL\n"
        "  (the organization depended on the Beneficiary's contributions). Show\n"
        "  decision-making authority with examples. If the Beneficiary's departure\n"
        "  or absence would significantly impact the organization, argue that point.\n\n"
        "PARAGRAPH 5 — EXTERNAL VALIDATION (MANDATORY):\n"
        "  Write a SEPARATE mini-paragraph for EACH recommendation letter writer or\n"
        "  external endorser found in the source materials. For each person: state\n"
        "  full name, title, and affiliation, then QUOTE their endorsement VERBATIM\n"
        "  in quotation marks. Do NOT paraphrase — use the endorser's own words.\n"
        "  Include government endorsements and association recognitions similarly.\n\n"
        "CLOSING: Tie back to the regulatory standard — demonstrate a leading or\n"
        "  critical role for organizations or establishments that have a\n"
        "  distinguished reputation."
    ),
    "salary": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — High Salary [8 C.F.R. §204.5(h)(3)(ix)]:\n"
        "STRUCTURE: Write one section per compensation component. Each section must contain ALL of the following paragraphs:\n\n"
        "PARAGRAPH 1 — COMPENSATION AMOUNT:\n"
        "  State the exact compensation amount(s). If the salary is in a foreign\n"
        "  currency, provide both the original amount and the USD equivalent with\n"
        "  the exchange rate used. Break down total compensation into base salary,\n"
        "  bonuses, allowances, and any supplemental income (consulting fees,\n"
        "  speaking honoraria, royalties) found in the source materials.\n\n"
        "PARAGRAPH 2 — THIRD-PARTY BENCHMARK:\n"
        "  Identify the specific benchmark source used for comparison (e.g.,\n"
        "  SalaryExpert, Bureau of Labor Statistics, PayScale, industry salary\n"
        "  survey). State the benchmark source's methodology and credibility.\n"
        "  Provide the benchmark figure for the same role, location, and\n"
        "  experience level.\n\n"
        "PARAGRAPH 3 — MULTIPLIER COMPUTATION:\n"
        "  COMPUTE the salary multiplier by dividing the Beneficiary's compensation\n"
        "  by the benchmark (e.g., 'the Beneficiary's annual compensation of\n"
        "  $185,000 is approximately 2.7 times the median salary of $68,500 for\n"
        "  comparable professionals in the region'). If multiple benchmarks are\n"
        "  available, compute the multiplier against each.\n\n"
        "PARAGRAPH 4 — SUPPLEMENTAL INCOME (if applicable):\n"
        "  If the Beneficiary receives additional income beyond base salary\n"
        "  (consulting, speaking, awards, royalties), list each source with its\n"
        "  amount. Argue that total remuneration, not just base salary, reflects\n"
        "  the Beneficiary's market value and extraordinary standing.\n\n"
        "CLOSING: Tie back to the regulatory standard — demonstrate that the\n"
        "  Beneficiary commands a high salary or other significantly high\n"
        "  remuneration for services in relation to others in the field."
    ),
    "commercial": (
        "\nCRITERION-SPECIFIC ARGUMENTATION — Commercial Success [8 C.F.R. §204.5(h)(3)(x)]:\n"
        "For each commercial achievement, build this chain:\n"
        "  revenue / sales / box office figures → market benchmarks → "
        "critical reception → sustained performance over time\n"
        "Evidence of commercial successes in the performing arts."
    ),
    "overall_merits": (
        "\nOVERALL MERITS — FINAL MERITS DETERMINATION (Kazarian Step 2):\n\n"
        "LEGAL FRAMEWORK:\n"
        "Under Kazarian v. USCIS, 596 F.3d 1115 (9th Cir. 2010), after the Beneficiary\n"
        "has satisfied the initial evidentiary threshold (at least three of the ten criteria\n"
        "under 8 C.F.R. §204.5(h)(3)), the adjudicator must conduct a final merits\n"
        "determination to evaluate whether the TOTALITY of the evidence demonstrates\n"
        "sustained national or international acclaim and that the Beneficiary is among\n"
        "the small percentage at the very top of the field.\n\n"
        "STRUCTURE (mandatory):\n"
        "1. TOTALITY DECLARATION — Open with a statement summarizing ALL criteria already\n"
        "   established in earlier sections. Reference each criterion by name and its key\n"
        "   achievement (1-2 sentences per criterion).\n"
        "2. SUPPLEMENTAL EVIDENCE BY THEME — For each piece of supplemental evidence moved\n"
        "   into this section, argue how it REINFORCES the overall picture of acclaim.\n"
        "   Cross-reference criteria where the same evidence supports multiple standards.\n"
        "3. SYNTHESIS — Draw connections across criteria: how awards corroborate leadership,\n"
        "   how publications validate original contributions, how judging roles confirm\n"
        "   peer recognition, etc.\n"
        "4. TOTALITY CONCLUSION — Conclude that, taken together, the evidence unmistakably\n"
        "   places the Beneficiary among the small percentage at the very top of the field\n"
        "   with sustained national/international acclaim.\n\n"
        "CROSS-REFERENCE RULES:\n"
        "- When referencing criteria established in earlier sections, if the SAME exhibit\n"
        "  appears in your SNIPPET INDEX, cite it normally with [Exhibit X, p.Y].\n"
        "- If the exhibit is NOT in your SNIPPET INDEX, restate the fact WITHOUT any\n"
        "  exhibit citation — just write the sentence naturally.\n"
        "- NEVER fabricate citation formats like [Cross-reference Section X] or [See above].\n"
    ),
}


# ============================================================
# Strategy registry
# ============================================================

def _build_eb1a_strategy(
    standard_key: str,
    legal_ref: str,
    chain: str,
    sentence_range: Tuple[int, int],
) -> WritingStrategy:
    appendix = _EB1A_APPENDICES.get(standard_key, "")
    return WritingStrategy(
        project_type="EB-1A",
        standard_key=standard_key,
        legal_ref=legal_ref,
        step1_base_system_prompt=_EB1A_BASE_SYSTEM_PROMPT,
        step1_argumentation_appendix=appendix,
        step1_instruction_block=_eb1a_instruction(chain, sentence_range),
        sentence_range=sentence_range,
        polish_single_subarg=False,
        frame_system_prompt=_EB1A_FRAME_SYSTEM_PROMPT,
        cross_section_context=False,
    )


def _build_niw_strategy(
    standard_key: str,
    legal_ref: str,
    chain: str,
    sentence_range: Tuple[int, int],
    cross_section_context: bool = False,
) -> WritingStrategy:
    return WritingStrategy(
        project_type="NIW",
        standard_key=standard_key,
        legal_ref=legal_ref,
        step1_base_system_prompt=_NIW_BASE_SYSTEM_PROMPT,
        step1_argumentation_appendix=_NIW_APPENDICES.get(standard_key, ""),
        step1_instruction_block=_niw_instruction(chain, sentence_range, standard_key=standard_key),
        sentence_range=sentence_range,
        polish_single_subarg=True,
        frame_system_prompt=_NIW_FRAME_SYSTEM_PROMPT,
        cross_section_context=cross_section_context,
    )


# ---------- EB-1A strategies ----------

_EB1A_STRATEGIES: Dict[str, WritingStrategy] = {
    "awards": _build_eb1a_strategy(
        "awards",
        "8 C.F.R. §204.5(h)(3)(i)",
        "granting body background → selection criteria (quote charter/rules) → COMPUTE acceptance rate percentage → co-recipient bios (3-5 sentences each) → regulatory tie-back",
        (6, 12),
    ),
    "membership": _build_eb1a_strategy(
        "membership",
        "8 C.F.R. §204.5(h)(3)(ii)",
        "association background → admission requirements (quote charter articles) → expert judgment in selection (named reviewers) → exclusivity + co-member credentials → regulatory tie-back",
        (6, 12),
    ),
    "published": _build_eb1a_strategy(
        "published",
        "8 C.F.R. §204.5(h)(3)(iii)",
        "publication founding + circulation + data source → editorial independence → substantive coverage proving material is ABOUT the Beneficiary → regulatory tie-back",
        (6, 10),
    ),
    "judging": _build_eb1a_strategy(
        "judging",
        "8 C.F.R. §204.5(h)(3)(iv)",
        "organization background + exact role title → selection as judge → scope + scale (quantify cases/submissions) + decision weight → co-judge credentials + impact → regulatory tie-back",
        (6, 12),
    ),
    "contribution": _build_eb1a_strategy(
        "contribution",
        "8 C.F.R. §204.5(h)(3)(v)",
        "technical description → adoption + commercialization data (page views, orders, revenue) → named beneficiaries with specific outcomes → expert endorsement quotes → field-wide significance → regulatory tie-back",
        (8, 15),
    ),
    "scholarly": _build_eb1a_strategy(
        "scholarly",
        "8 C.F.R. §204.5(h)(3)(vi)",
        "journal publisher + IF + ranking → COMPUTE citation percentile against field averages → article impact + recommendation letter quotes → cross-discipline breadth → regulatory tie-back",
        (6, 12),
    ),
    "display": _build_eb1a_strategy(
        "display",
        "8 C.F.R. §204.5(h)(3)(vii)",
        "venue prestige → curatorial selection → audience reach → critical reception",
        (3, 5),
    ),
    "leading": _build_eb1a_strategy(
        "leading",
        "8 C.F.R. §204.5(h)(3)(viii)",
        "institution background (founding + government recognition + credit rating) → role title + enumerated duties → quantified impact (monetary amounts, participant counts, mentee outcomes) → decision-making authority → external validation (government/association endorsement quotes) → regulatory tie-back",
        (8, 15),
    ),
    "salary": _build_eb1a_strategy(
        "salary",
        "8 C.F.R. §204.5(h)(3)(ix)",
        "dual-currency compensation amount → named third-party benchmark source + methodology → COMPUTE salary multiplier → supplemental income line-by-line → regulatory tie-back",
        (5, 10),
    ),
    "commercial": _build_eb1a_strategy(
        "commercial",
        "8 C.F.R. §204.5(h)(3)(x)",
        "revenue/sales → market benchmarks → critical reception → sustained performance",
        (3, 5),
    ),
    "overall_merits": WritingStrategy(
        project_type="EB-1A",
        standard_key="overall_merits",
        legal_ref="8 C.F.R. §204.5(h)(2) & Kazarian v. USCIS, 596 F.3d 1115 (9th Cir. 2010)",
        step1_base_system_prompt=_EB1A_BASE_SYSTEM_PROMPT,
        step1_argumentation_appendix=_EB1A_APPENDICES.get("overall_merits", ""),
        step1_instruction_block=_eb1a_instruction(
            "totality declaration (list all established criteria) → supplemental evidence by theme → "
            "cross-criteria synthesis (connect awards to leadership, publications to contributions, etc.) → "
            "totality conclusion (small percentage at top of field + sustained acclaim)",
            (4, 8),
        ),
        sentence_range=(4, 8),
        polish_single_subarg=False,
        frame_system_prompt=_EB1A_FRAME_SYSTEM_PROMPT,
        cross_section_context=True,
    ),
}


# ---------- NIW strategies ----------

_NIW_STRATEGIES: Dict[str, WritingStrategy] = {
    "prong1_merit": _build_niw_strategy(
        "prong1_merit",
        "Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016), Prong 1",
        (
            "ARGUMENTATION CHAIN for Prong 1 (Substantial Merit & National Importance):\n"
            "  endeavor definition → substantive value with concrete evidence → "
            "national-level importance (statistics, policy relevance, broad applicability)"
        ),
        (3, 6),
    ),
    "prong2_positioned": _build_niw_strategy(
        "prong2_positioned",
        "Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016), Prong 2",
        (
            "ARGUMENTATION CHAIN for Prong 2 (Well Positioned to Advance):\n"
            "  qualifications & expertise → track record of achievements → "
            "progress already made → concrete future plans"
        ),
        (3, 5),
    ),
    "prong3_balance": _build_niw_strategy(
        "prong3_balance",
        "Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016), Prong 3",
        (
            "ARGUMENTATION CHAIN for Prong 3 (Balance of Equities — Waiver Justification):\n"
            "  impracticality of labor certification → national benefit analysis → "
            "benefits beyond any single employer → urgency (if applicable) → explicit balancing"
        ),
        (4, 8),
        cross_section_context=True,
    ),
}


# ---------- Key aliases (backward compatibility) ----------

_KEY_ALIASES: Dict[str, str] = {
    "press": "published",
    "published_material": "published",
    "original_contribution": "contribution",
    "original_contributions": "contribution",
    "scholarly_articles": "scholarly",
    "exhibitions": "display",
    "leading_role": "leading",
    "high_salary": "salary",
    "commercial_success": "commercial",
}

# Fallback generic EB-1A strategy for unknown keys
_EB1A_GENERIC = WritingStrategy(
    project_type="EB-1A",
    standard_key="_generic",
    legal_ref="",
    step1_base_system_prompt=_EB1A_BASE_SYSTEM_PROMPT,
    step1_argumentation_appendix="",
    step1_instruction_block=_eb1a_instruction(
        "fact → authority → rigor → scale → peer comparison", (3, 6)
    ),
    sentence_range=(3, 6),
    polish_single_subarg=False,
    frame_system_prompt=_EB1A_FRAME_SYSTEM_PROMPT,
    cross_section_context=False,
)

# Fallback generic NIW strategy for unknown keys
_NIW_GENERIC = WritingStrategy(
    project_type="NIW",
    standard_key="_generic",
    legal_ref="",
    step1_base_system_prompt=_NIW_BASE_SYSTEM_PROMPT,
    step1_argumentation_appendix="",
    step1_instruction_block=_niw_instruction(
        "- Build a complete argument chain from the evidence", (3, 6)
    ),
    sentence_range=(3, 6),
    polish_single_subarg=True,
    frame_system_prompt=_NIW_FRAME_SYSTEM_PROMPT,
    cross_section_context=False,
)


# ============================================================
# L-1A base system prompts
# ============================================================

_L1A_BASE_SYSTEM_PROMPT = """\
You are a Senior Immigration Attorney at a top-tier law firm drafting an L-1A intracompany transferee petition letter under INA §101(a)(15)(L) and 8 CFR §214.2(l).

ARGUMENTATION METHOD — For each piece of evidence, mentally follow this chain, then write it as NATURAL PROSE (do NOT output labels like "FACT:", "LEGAL NEXUS:", "QUANTIFICATION:", "CORROBORATION:", or "CONCLUSION:" in your text):
1. State the concrete fact (company formation date, ownership percentage, square footage, revenue figure) and cite [Exhibit X, p.Y]
2. Explain how this fact satisfies the specific regulatory requirement
3. Provide exact numbers — dollar amounts, percentages, square feet, employee counts, revenue figures
4. Cross-reference with other exhibits when the same fact appears in multiple sources
5. Tie back to the legal standard being addressed

CRITICAL OUTPUT RULES:
- Write ONLY natural legal prose paragraphs. NEVER include analytical framework labels (FACT:, LEGAL NEXUS:, QUANTIFICATION:, CORROBORATION:, CONCLUSION:) in your output.
- Do NOT include raw personal contact information (phone numbers, email addresses, home addresses) — these are irrelevant to legal argumentation.
- Vary your conclusion sentences — do NOT repeat the same formulaic closing across every paragraph.

L-1A petitions are fact-intensive. Every legal point must be supported by specific, verifiable data from the source materials.

ABSOLUTE RULES:
1. Every fact MUST come from the SOURCE MATERIALS below. NEVER invent facts.
2. Extract ALL relevant numbers, dates, names, and statistics from the source materials.
3. Write in THIRD PERSON about "the Beneficiary" and "the Petitioner".
4. Each sentence must cite [Exhibit X, p.Y] in the text AND include the matching \
snippet_id(s) from the SNIPPET INDEX in the JSON snippet_ids array. Pick the \
MOST RELEVANT block(s) — do NOT include all blocks on the page.
5. Professional legal argumentative tone, 100% English."""

_L1A_FRAME_SYSTEM_PROMPT = (
    "You are a Senior Immigration Attorney writing an L-1A intracompany transferee "
    "petition letter under INA §101(a)(15)(L) and 8 CFR §214.2(l)."
)


def _l1a_instruction(chain: str, sentence_range: Tuple[int, int]) -> str:
    lo, hi = sentence_range
    return (
        f"INSTRUCTIONS:\n"
        f"- Write one paragraph ({lo}-{hi} sentences) per Sub-Argument listed above\n"
        f"- ARGUMENTATION CHAIN: {chain}\n"
        f"- QUANTIFICATION (MANDATORY): Every paragraph must include at least one specific\n"
        f"  number from the source materials — dollar amounts, percentages, square footage,\n"
        f"  employee counts, revenue figures, dates. L-1A petitions require concrete data.\n"
        f"- PERSON NAMING (MANDATORY): When the source materials name a person, use their\n"
        f"  FULL NAME with a title prefix (Ms., Mr., etc.) and describe their role/position.\n"
        f"- CORPORATE ENTITY NAMING: Always use the full legal name of each entity on first\n"
        f"  reference, then the defined short form (e.g., '[Full Company Name, Inc.]\n"
        f"  (hereinafter \"Petitioner\")') on subsequent references.\n"
        f"{_INSTRUCTION_TAIL}"
    )


# ============================================================
# L-1A per-standard argumentation appendices
# ============================================================

_L1A_APPENDICES: Dict[str, str] = {
    "qualifying_relationship": (
        "\nSTANDARD-SPECIFIC ARGUMENTATION — Qualifying Corporate Relationship "
        "[INA §101(a)(15)(L); 8 CFR §214.2(l)(1)(ii)]:\n\n"
        "STRUCTURE: Build a single comprehensive section covering ALL of the following:\n\n"
        "PARAGRAPH 1 — U.S. ENTITY FORMATION:\n"
        "  State the U.S. entity's full legal name, state of incorporation, date of formation,\n"
        "  and FEIN. Cite the Certificate of Incorporation and FEIN Notice by exhibit number.\n\n"
        "PARAGRAPH 2 — OWNERSHIP CHAIN AND CONTROL:\n"
        "  Describe the ownership structure step by step: who holds what percentage of shares,\n"
        "  any transfers or reorganizations, and on what date. State the resulting relationship\n"
        "  (parent-subsidiary, branch, or affiliate). Cite meeting minutes, stock certificates,\n"
        "  by-laws, or articles of association. Reference tax filings (e.g., IRS Schedule G)\n"
        "  or corporate registration records that document the controlling entity.\n\n"
        "PARAGRAPH 3 — PHYSICAL PREMISES:\n"
        "  State the exact address, lease start date, lease term, and total square footage.\n"
        "  Describe the nature of the space (office, warehouse, or both). Cite the commercial\n"
        "  lease agreement and any office/warehouse photographs.\n\n"
        "PARAGRAPH 4 — PARENT COMPANY INVESTMENT:\n"
        "  State the exact amount invested (in USD), the date of transfer, and the purpose.\n"
        "  Cite bank statements showing the wire transfer. Explain how this investment supports\n"
        "  the U.S. entity's business operations and growth.\n\n"
        "CLOSING: Tie back — the foregoing establishes a qualifying relationship between the\n"
        "  foreign parent company and the U.S. petitioner as required under 8 CFR §214.2(l)."
    ),
    "doing_business": (
        "\nSTANDARD-SPECIFIC ARGUMENTATION — Active Business Operations "
        "[8 CFR §214.2(l)(1)(ii)(H)]:\n\n"
        "STRUCTURE: Build a comprehensive section covering BOTH the U.S. and foreign entities:\n\n"
        "PARAGRAPH 1 — U.S. ENTITY BUSINESS DESCRIPTION:\n"
        "  Describe the U.S. entity's core business — products, services, target market.\n"
        "  Include specific product categories or service lines from the source materials.\n\n"
        "PARAGRAPH 2 — U.S. ENTITY FINANCIAL PERFORMANCE:\n"
        "  State specific revenue figures with dates from the source materials.\n"
        "  Cite tax returns, bank statements, or audit reports. Include projected\n"
        "  revenue from the business plan if available.\n\n"
        "PARAGRAPH 3 — U.S. ENTITY GROWTH AND HIRING:\n"
        "  State current employee count and hiring plans. Describe planned departments and\n"
        "  positions. Provide the timeline for expansion (e.g., '19 employees across five\n"
        "  divisions within five years').\n\n"
        "PARAGRAPH 4 — CUSTOMER AND PARTNER RELATIONSHIPS:\n"
        "  Name specific customers, partners, or vendors from the source materials.\n"
        "  Cite cooperation agreements, contracts, invoices, and transaction documents.\n\n"
        "PARAGRAPH 5 — FOREIGN PARENT COMPANY OPERATIONS:\n"
        "  State the parent company's incorporation date, location, number of employees,\n"
        "  and revenue (in both local currency and USD). Describe its business scope and\n"
        "  geographic reach. Cite the audit report and business documents.\n\n"
        "CLOSING: Tie back — both entities are engaged in regular, systematic, continuous\n"
        "  provision of goods and services as required under 8 CFR §214.2(l)(1)(ii)(H)."
    ),
    "executive_capacity": (
        "\nSTANDARD-SPECIFIC ARGUMENTATION — Executive/Managerial Capacity "
        "[INA §101(a)(44); 8 CFR §214.2(l)(1)(ii)(B)-(C)]:\n\n"
        "STRUCTURE: Build a comprehensive section with the following components:\n\n"
        "PARAGRAPH 1 — PROPOSED POSITION AND ORGANIZATIONAL OVERVIEW:\n"
        "  State the Beneficiary's proposed title and the organizational hierarchy.\n"
        "  Describe the number of current employees and planned growth.\n\n"
        "PARAGRAPH 2-6 — EXECUTIVE DUTIES WITH TIME ALLOCATION (MANDATORY):\n"
        "  Write one paragraph for EACH duty segment from the source materials.\n"
        "  Each paragraph must state:\n"
        "  (a) The duty category and percentage of working time\n"
        "  (b) Specific first-year tasks and responsibilities\n"
        "  Example structure: 'Approximately 25% of the Beneficiary's working time will be\n"
        "  devoted to executive leadership and strategic direction. Specifically, she will...\n"
        "  [list 3-4 specific duties from the source materials].'\n\n"
        "PARAGRAPH 7 — DIRECT SUBORDINATES (MANDATORY — do NOT skip):\n"
        "  Write a SEPARATE description for EACH direct subordinate named in the source materials.\n"
        "  For each subordinate, state:\n"
        "  (1) Full name with title (e.g., 'Vice President Mr. [Name]')\n"
        "  (2) Their specific managerial duties (enumerate 3-5 duties)\n"
        "  (3) How they alleviate the Beneficiary from daily operational tasks\n"
        "  This is CRITICAL for establishing that the Beneficiary operates in a genuinely\n"
        "  executive capacity — subordinate managers handle day-to-day operations.\n\n"
        "CLOSING: Tie back — the organizational structure, specific executive duties, and\n"
        "  qualified subordinate management team establish that the Beneficiary will serve in\n"
        "  an executive capacity as defined under INA §101(a)(44)."
    ),
    "qualifying_employment": (
        "\nSTANDARD-SPECIFIC ARGUMENTATION — Qualifying Employment Abroad "
        "[8 CFR §214.2(l)(1)(ii)(A)]:\n\n"
        "STRUCTURE: Build a comprehensive section covering the Beneficiary's qualifications:\n\n"
        "PARAGRAPH 1 — EDUCATIONAL BACKGROUND:\n"
        "  State the Beneficiary's degree(s), major, and how their education relates to\n"
        "  the executive role. Cite degree certificates.\n\n"
        "PARAGRAPH 2 — EMPLOYMENT HISTORY AND EXECUTIVE EXPERIENCE:\n"
        "  State the Beneficiary's tenure at the foreign parent company — exact start date,\n"
        "  title (highest level executive), and duration. Describe prior executive positions\n"
        "  at other companies if applicable. Emphasize the continuous one-year requirement.\n\n"
        "PARAGRAPH 3-4 — EXECUTIVE DUTIES AT FOREIGN ENTITY:\n"
        "  Describe the Beneficiary's specific executive duties at the foreign entity with\n"
        "  time allocation percentages. Mirror the U.S. duties structure to show continuity\n"
        "  of executive function.\n\n"
        "PARAGRAPH 5 — SUBORDINATE MANAGEMENT AT FOREIGN ENTITY:\n"
        "  Name the departments and department managers supervised by the Beneficiary.\n"
        "  State each manager's name, title, degree, and years of experience.\n\n"
        "PARAGRAPH 6 — SPECIFIC ACHIEVEMENTS AND CONTRIBUTIONS:\n"
        "  Describe concrete business achievements: contracts executed, partnerships\n"
        "  established, revenue growth, market expansion. Use specific names, dollar\n"
        "  amounts, and dates from the source materials.\n\n"
        "CLOSING: Tie back — the Beneficiary has been employed in an executive capacity\n"
        "  at the qualifying foreign entity for well over one continuous year within the\n"
        "  three years preceding this petition, satisfying 8 CFR §214.2(l)(1)(ii)(A)."
    ),
}


# ---------- L-1A strategies ----------

def _build_l1a_strategy(
    standard_key: str,
    legal_ref: str,
    chain: str,
    sentence_range: Tuple[int, int],
) -> WritingStrategy:
    appendix = _L1A_APPENDICES.get(standard_key, "")
    return WritingStrategy(
        project_type="L-1A",
        standard_key=standard_key,
        legal_ref=legal_ref,
        step1_base_system_prompt=_L1A_BASE_SYSTEM_PROMPT,
        step1_argumentation_appendix=appendix,
        step1_instruction_block=_l1a_instruction(chain, sentence_range),
        sentence_range=sentence_range,
        polish_single_subarg=False,
        frame_system_prompt=_L1A_FRAME_SYSTEM_PROMPT,
        cross_section_context=False,
    )


_L1A_STRATEGIES: Dict[str, WritingStrategy] = {
    "qualifying_relationship": _build_l1a_strategy(
        "qualifying_relationship",
        "INA §101(a)(15)(L); 8 CFR §214.2(l)(1)(ii)",
        "U.S. entity formation → ownership chain (shareholding with corporate records) → physical premises (address, sq ft, lease) → parent investment (amount, bank statement) → regulatory tie-back",
        (6, 12),
    ),
    "doing_business": _build_l1a_strategy(
        "doing_business",
        "8 CFR §214.2(l)(1)(ii)(H)",
        "U.S. business description → financial performance (revenue, tax return) → growth plan (hiring, departments) → customer/partner names → parent company operations (revenue, employees, scope) → regulatory tie-back",
        (8, 15),
    ),
    "executive_capacity": _build_l1a_strategy(
        "executive_capacity",
        "INA §101(a)(44); 8 CFR §214.2(l)(1)(ii)(B)-(C)",
        "proposed position + org overview → 5 duty segments with % time allocation → subordinate managers (names, titles, enumerated duties) → day-to-day delegation → regulatory tie-back",
        (10, 20),
    ),
    "qualifying_employment": _build_l1a_strategy(
        "qualifying_employment",
        "8 CFR §214.2(l)(1)(ii)(A)",
        "education + degrees → employment history (dates, titles, 1+ year continuous) → executive duties abroad (% time) → subordinate management abroad → specific achievements (contracts, revenue) → regulatory tie-back",
        (8, 15),
    ),
}

# Fallback generic L-1A strategy for unknown keys
_L1A_GENERIC = WritingStrategy(
    project_type="L-1A",
    standard_key="_generic",
    legal_ref="",
    step1_base_system_prompt=_L1A_BASE_SYSTEM_PROMPT,
    step1_argumentation_appendix="",
    step1_instruction_block=_l1a_instruction(
        "fact → legal nexus → quantification → corroboration → conclusion", (5, 10)
    ),
    sentence_range=(5, 10),
    polish_single_subarg=False,
    frame_system_prompt=_L1A_FRAME_SYSTEM_PROMPT,
    cross_section_context=False,
)


# ============================================================
# Public API
# ============================================================

def get_writing_strategy(project_type: str, standard_key: str) -> WritingStrategy:
    """
    Look up the writing strategy for a given project type and standard key.

    Resolves key aliases (e.g. "press" → "published") and falls back to
    a generic strategy if the exact key is not found.
    """
    canonical = _KEY_ALIASES.get(standard_key, standard_key)

    if project_type == "NIW":
        strategy = _NIW_STRATEGIES.get(canonical)
        if strategy:
            return strategy
        return _NIW_GENERIC

    if project_type == "L-1A":
        strategy = _L1A_STRATEGIES.get(canonical)
        if strategy:
            return strategy
        return _L1A_GENERIC

    # Default: EB-1A
    strategy = _EB1A_STRATEGIES.get(canonical)
    if strategy:
        return strategy
    return _EB1A_GENERIC
