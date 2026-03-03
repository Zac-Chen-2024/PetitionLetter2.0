"""
Compare AI-generated writing output (latest run) with lawyer example letters.
Extract key structural elements from both and highlight gaps.
"""

import json
import os
import re
import glob

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "backend", "data", "projects")
DOC_DIR = os.path.join(PROJECT_ROOT, "Doc", "eb1a")


def load_lawyer_letter(project_id):
    name_map = {
        "dehuan_liu": "Dehuan Liu PetitionLetter.md",
        "yaruo_qu": "Yaruo Qu PetitionLetter.md",
    }
    path = os.path.join(DOC_DIR, name_map.get(project_id, ""))
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return f.read()


def extract_lawyer_sections(text, project_id):
    """Split lawyer letter into per-criterion sections using ### headers."""
    sections = {}

    if project_id == "dehuan_liu":
        # Headers like: ### I. Dr. Liu's receipt of nationally recognized prizes...
        # ### II. Evidence regarding Dr. Liu's involvement in judging...
        # ### III. Evidence of Dr. Liu's authorship of scholarly articles...
        # ### IV. Evidence that Dr. Liu has performed a leading role...
        # ### V. Dr. Liu's compensation is high...
        splits = re.split(r'(?=^### )', text, flags=re.MULTILINE)
        for part in splits:
            m = re.match(r'^### (.*?)$', part, re.MULTILINE)
            if not m:
                continue
            header = m.group(1).lower()
            if 'award' in header or 'prize' in header:
                sections['awards'] = part
            elif 'judg' in header:
                sections['judging'] = part
            elif 'scholarly' in header or 'authorship' in header:
                sections['scholarly_articles'] = part
            elif 'leading' in header or 'critical' in header:
                sections['leading_role'] = part
            elif 'salary' in header or 'compensation' in header or 'remuneration' in header:
                sections['high_salary'] = part

    elif project_id == "yaruo_qu":
        # Headers like:
        # ### Ms. Qu's Membership in Associations...
        # ### II. Published Materials about Ms. Qu...
        # ### III. Ms. Qu's Original Contributions...
        # ### IV. Ms. Qu's Performance as a Leading...
        splits = re.split(r'(?=^### )', text, flags=re.MULTILINE)
        for part in splits:
            m = re.match(r'^### (.*?)$', part, re.MULTILINE)
            if not m:
                continue
            header = m.group(1).lower()
            if 'member' in header:
                sections['membership'] = part
            elif 'publish' in header or 'material' in header:
                sections['published_material'] = part
            elif 'contribut' in header:
                sections['original_contribution'] = part
            elif 'leading' in header or 'critical' in header:
                sections['leading_role'] = part
            elif 'award' in header or 'prize' in header:
                sections['awards'] = part
            elif 'judg' in header:
                sections['judging'] = part
            elif 'salary' in header or 'compensation' in header:
                sections['high_salary'] = part
            elif 'scholar' in header or 'article' in header:
                sections['scholarly_articles'] = part

    return sections


def load_latest_ai_output(project_id, standard_key):
    writing_dir = os.path.join(DATA_DIR, project_id, "writing_v3")
    pattern = os.path.join(writing_dir, f"writing_{standard_key}_*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        return None
    latest = files[-1]
    with open(latest, encoding="utf-8") as f:
        return json.load(f)


def analyze_text(text):
    """Analyze text for key structural elements."""
    if not text:
        return {}
    return {
        "char_count": len(text),
        "word_count": len(text.split()),
        "sentence_count": len(re.findall(r'[.!?](?:\s|$)', text)),
        "has_percentage": bool(re.search(r'\d+\.?\d*\s*%', text)),
        "has_acceptance_rate": bool(re.search(r'accept(?:ance|ed)|select(?:ion|ed).*(?:rate|ratio)|out of \d|from (?:a pool|among|\d)', text, re.I)),
        "has_charter_quote": bool(re.search(r'article\s+\d|section\s+\d|bylaw|charter|chapter\s+\d|clause|provision', text, re.I)),
        "has_co_recipients": bool(re.search(r'co-recipient|fellow\s+(?:winner|member|award)|alongside|together with|also (?:received|won|awarded)|other.*(?:winner|recipient|member|honoree)', text, re.I)),
        "has_founding_year": bool(re.search(r'founded|established|since \d{4}|in \d{4}.*(?:found|establish|creat)', text, re.I)),
        "has_circulation": bool(re.search(r'circulation|readership|subscriber|copies|print run|distribut', text, re.I)),
        "has_currency_amount": bool(re.search(r'\$[\d,]+|RMB\s*[\d,]+|CNY|USD|¥[\d,]+|yuan|salary of|annual.*(?:compensation|income|pay)', text, re.I)),
        "has_multiplier": bool(re.search(r'\d+\.?\d*\s*times|multiplier|multiple of|fold|X\s+(?:the|that|higher)|compared to.*(?:\d|average|median)', text, re.I)),
        "has_named_persons": len(re.findall(r'(?:Dr|Prof|Professor|Mr|Ms|Mrs|Director|Chairman|Dean)\.\s*\w+', text)),
        "has_exhibit_cite": bool(re.search(r'Exhibit\s+[A-Z]', text, re.I)),
        "has_bio_sentences": bool(re.search(r'who (?:is|was|has been|served|holds|received|currently|also)', text, re.I)),
        "has_impact_factor": bool(re.search(r'impact factor|IF\s*(?:[:=]|of)|CiteScore|SCI|SSCI|CSSCI|JCR', text, re.I)),
        "has_citation_data": bool(re.search(r'cit(?:ed|ation)|h-index|download|Google Scholar', text, re.I)),
        "has_ranking": bool(re.search(r'rank(?:ed|ing|s)|top\s+\d|percentile|quartile|Q[1234]', text, re.I)),
        "has_gov_recognition": bool(re.search(r'(?:government|ministry|state|national)\s+(?:recogn|approv|certif|accredit|endors|designat)', text, re.I)),
        "has_quantified_impact": bool(re.search(r'\d+(?:,\d{3})*\s+(?:student|athlete|participant|member|employee|case|submission|application|review)', text, re.I)),
    }


# Which features matter for each standard
STANDARD_FEATURES = {
    "awards": [
        "has_founding_year", "has_charter_quote", "has_percentage",
        "has_acceptance_rate", "has_co_recipients", "has_bio_sentences",
        "has_exhibit_cite", "has_named_persons",
    ],
    "membership": [
        "has_founding_year", "has_charter_quote", "has_acceptance_rate",
        "has_co_recipients", "has_bio_sentences", "has_exhibit_cite",
        "has_named_persons",
    ],
    "published_material": [
        "has_founding_year", "has_circulation", "has_exhibit_cite",
        "has_named_persons",
    ],
    "judging": [
        "has_founding_year", "has_named_persons", "has_bio_sentences",
        "has_exhibit_cite", "has_quantified_impact",
    ],
    "original_contribution": [
        "has_named_persons", "has_bio_sentences", "has_exhibit_cite",
        "has_currency_amount", "has_citation_data", "has_quantified_impact",
    ],
    "scholarly_articles": [
        "has_impact_factor", "has_citation_data", "has_ranking",
        "has_percentage", "has_exhibit_cite", "has_named_persons",
    ],
    "leading_role": [
        "has_founding_year", "has_named_persons", "has_bio_sentences",
        "has_currency_amount", "has_exhibit_cite", "has_gov_recognition",
        "has_quantified_impact",
    ],
    "high_salary": [
        "has_currency_amount", "has_multiplier", "has_percentage",
        "has_exhibit_cite", "has_named_persons",
    ],
}


def compare_project(project_id):
    letter = load_lawyer_letter(project_id)
    if not letter:
        print(f"  No lawyer letter found for {project_id}")
        return

    lawyer_sections = extract_lawyer_sections(letter, project_id)
    print(f"\n  Lawyer letter standards found: {sorted(lawyer_sections.keys())}")

    all_standards = sorted(set(list(lawyer_sections.keys()) + [
        "awards", "membership", "published_material", "judging",
        "original_contribution", "scholarly_articles", "leading_role",
        "high_salary", "commercial_success",
    ]))

    for sk in all_standards:
        lawyer_text = lawyer_sections.get(sk)
        ai_data = load_latest_ai_output(project_id, sk)
        ai_text = ai_data.get("paragraph_text", "") if ai_data else ""

        if not lawyer_text and not ai_text:
            continue

        print(f"\n  {'='*65}")
        print(f"  {project_id} / {sk}")
        print(f"  {'='*65}")

        if not lawyer_text:
            ai_analysis = analyze_text(ai_text)
            print(f"    [No lawyer example] | AI: {ai_analysis['sentence_count']} sents, {ai_analysis['word_count']} words")
            continue

        if not ai_text:
            lawyer_analysis = analyze_text(lawyer_text)
            print(f"    Lawyer: {lawyer_analysis['sentence_count']} sents, {lawyer_analysis['word_count']} words | [No AI output]")
            continue

        lawyer_analysis = analyze_text(lawyer_text)
        ai_analysis = analyze_text(ai_text)

        # Size comparison
        print(f"    {'Metric':<25} {'Lawyer':>10} {'AI':>10}")
        print(f"    {'-'*47}")
        print(f"    {'Sentences':<25} {lawyer_analysis['sentence_count']:>10} {ai_analysis['sentence_count']:>10}")
        print(f"    {'Words':<25} {lawyer_analysis['word_count']:>10} {ai_analysis['word_count']:>10}")
        print(f"    {'Characters':<25} {lawyer_analysis['char_count']:>10} {ai_analysis['char_count']:>10}")
        np_l = lawyer_analysis['has_named_persons']
        np_a = ai_analysis['has_named_persons']
        print(f"    {'Named persons (count)':<25} {np_l:>10} {np_a:>10}")

        # Feature comparison
        features = STANDARD_FEATURES.get(sk, [])
        if features:
            print(f"\n    {'Feature':<30} {'Lawyer':>8} {'AI':>8} {'Status':>8}")
            print(f"    {'-'*55}")
            missing = []
            for feat in features:
                l_val = lawyer_analysis.get(feat, False)
                a_val = ai_analysis.get(feat, False)
                l_yes = (l_val if isinstance(l_val, bool) else l_val > 0)
                a_yes = (a_val if isinstance(a_val, bool) else a_val > 0)

                if l_yes and not a_yes:
                    status = "MISSING"
                    missing.append(feat)
                elif l_yes and a_yes:
                    status = "OK"
                elif not l_yes and a_yes:
                    status = "EXTRA"
                else:
                    status = "-"

                feat_label = feat.replace("has_", "").replace("_", " ").title()
                l_str = "Y" if l_yes else "-"
                a_str = "Y" if a_yes else "-"
                print(f"    {feat_label:<30} {l_str:>8} {a_str:>8} {status:>8}")

            if missing:
                print(f"\n    >>> GAPS: {', '.join(f.replace('has_','') for f in missing)}")
            else:
                print(f"\n    >>> ALL FEATURES PRESENT")

    # Print AI-only standards (no lawyer example)
    ai_only = []
    for sk in all_standards:
        if sk not in lawyer_sections:
            ai_data = load_latest_ai_output(project_id, sk)
            if ai_data:
                ai_only.append(sk)
    if ai_only:
        print(f"\n  Standards with AI output but no lawyer example: {ai_only}")


def main():
    for pid in ["dehuan_liu", "yaruo_qu"]:
        print(f"\n{'#'*70}")
        print(f"  PROJECT: {pid}")
        print(f"{'#'*70}")
        compare_project(pid)

    print("\n\nDone.")


if __name__ == "__main__":
    main()
