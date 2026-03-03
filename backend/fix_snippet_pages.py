"""
Fix snippet page numbers for projects affected by the p{page}_{block_id} double-prefix bug.

Root cause: snippet_extractor.py created composite_id = f"p{page_num}_{block_id}" where
block_id already had page prefix (e.g., p2_b0), producing p2_p2_b0. For some exhibits,
the extraction LLM returned the wrong composite_id (p1_p1_b0 for all content), causing
all snippets to be assigned page=1.

Fix strategy: For each suspect snippet (page=1 but text doesn't match page 1 content),
search all pages' blocks for the best text match and update page + block_id.
"""

import json
import os
import sys
from collections import defaultdict
from difflib import SequenceMatcher

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "projects")


def load_document(project_id: str, exhibit_id: str):
    path = os.path.join(DATA_DIR, project_id, "documents", f"{exhibit_id}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_block_text_index(doc_data):
    """Build {page_num: [(block_id, text)]} index from document pages."""
    index = defaultdict(list)
    for page in doc_data.get("pages", []):
        pn = page.get("page_number", 0)
        for block in page.get("text_blocks", []):
            bid = block.get("block_id", "")
            text = block.get("text_content", "").strip()
            if text and len(text) >= 5:
                index[pn].append((bid, text))
    return index


def find_best_page(snippet_text: str, block_index: dict, exclude_page: int = None):
    """Find the page whose blocks best match the snippet text.

    Returns (best_page, best_block_id, score) or (None, None, 0).
    """
    best_page = None
    best_block_id = None
    best_score = 0.0

    for page_num, blocks in block_index.items():
        if exclude_page is not None and page_num == exclude_page:
            continue
        for block_id, block_text in blocks:
            # Try substring match first (fastest)
            if snippet_text[:80] in block_text or block_text[:80] in snippet_text:
                score = 0.95
            else:
                # Fall back to SequenceMatcher for fuzzy matching
                score = SequenceMatcher(
                    None,
                    snippet_text[:300].lower(),
                    block_text[:300].lower()
                ).ratio()

            if score > best_score:
                best_score = score
                best_page = page_num
                best_block_id = block_id

    return best_page, best_block_id, best_score


def fix_project(project_id: str, dry_run: bool = False):
    """Fix snippet page numbers for a single project."""
    extraction_path = os.path.join(
        DATA_DIR, project_id, "extraction", "combined_extraction.json"
    )
    if not os.path.exists(extraction_path):
        print(f"  No combined_extraction.json for {project_id}")
        return 0

    with open(extraction_path, encoding="utf-8") as f:
        extraction_data = json.load(f)

    snippets = extraction_data.get("snippets", [])
    if not snippets:
        print(f"  No snippets for {project_id}")
        return 0

    # Identify suspect exhibits: those where ALL snippets have page=1
    exhibit_snippets = defaultdict(list)
    for snip in snippets:
        exhibit_snippets[snip.get("exhibit_id", "")].append(snip)

    suspect_exhibits = []
    for eid, esnips in exhibit_snippets.items():
        if len(esnips) >= 2 and all(s.get("page") == 1 for s in esnips):
            # Check if page 1 is just a cover page
            doc = load_document(project_id, eid)
            if not doc:
                continue
            pages = doc.get("pages", [])
            if not pages:
                continue
            page1_blocks = [
                b for b in pages[0].get("text_blocks", [])
                if b.get("text_content", "").strip()
            ]
            page1_text = " ".join(
                b.get("text_content", "").strip() for b in page1_blocks
            )
            # Cover pages typically have very short text like "Exhibit C-7"
            if len(page1_text) < 50 and len(pages) > 1:
                suspect_exhibits.append(eid)

    if not suspect_exhibits:
        print(f"  No suspect exhibits for {project_id}")
        return 0

    print(f"  Suspect exhibits ({len(suspect_exhibits)}): {sorted(suspect_exhibits)}")

    # Fix each suspect exhibit
    total_fixed = 0
    for eid in sorted(suspect_exhibits):
        doc = load_document(project_id, eid)
        if not doc:
            continue

        block_index = build_block_text_index(doc)
        esnips = exhibit_snippets[eid]
        fixed = 0

        for snip in esnips:
            snippet_text = snip.get("text", "")
            if not snippet_text:
                continue

            best_page, best_block_id, score = find_best_page(
                snippet_text, block_index
            )

            if best_page is not None and best_page != 1 and score >= 0.3:
                old_page = snip.get("page")
                old_block = snip.get("block_id")
                snip["page"] = best_page
                snip["block_id"] = best_block_id
                fixed += 1
                if fixed <= 3:  # Print first few examples
                    print(
                        f"    {eid}: page {old_page}->{best_page}, "
                        f"block {old_block}->{best_block_id} "
                        f"(score={score:.2f}) "
                        f'text="{snippet_text[:50]}..."'
                    )

        if fixed > 3:
            print(f"    ... and {fixed - 3} more")
        print(f"    {eid}: {fixed}/{len(esnips)} snippets fixed")
        total_fixed += fixed

    # Save
    if total_fixed > 0 and not dry_run:
        # Backup first
        backup_path = extraction_path + ".bak"
        if not os.path.exists(backup_path):
            with open(extraction_path, "r", encoding="utf-8") as f:
                with open(backup_path, "w", encoding="utf-8") as fb:
                    fb.write(f.read())
            print(f"  Backup saved: {backup_path}")

        with open(extraction_path, "w", encoding="utf-8") as f:
            json.dump(extraction_data, f, indent=2, ensure_ascii=False)
        print(f"  Saved {total_fixed} fixes to {extraction_path}")

    return total_fixed


def main():
    dry_run = "--dry-run" in sys.argv

    # Find all projects
    if not os.path.exists(DATA_DIR):
        print(f"Data dir not found: {DATA_DIR}")
        return

    projects = [
        d for d in os.listdir(DATA_DIR)
        if os.path.isdir(os.path.join(DATA_DIR, d))
    ]

    print(f"Scanning {len(projects)} projects..." + (" (DRY RUN)" if dry_run else ""))

    total = 0
    for pid in sorted(projects):
        print(f"\n{'='*50}")
        print(f"  Project: {pid}")
        print(f"{'='*50}")
        fixed = fix_project(pid, dry_run=dry_run)
        total += fixed

    print(f"\n\nTotal snippets fixed: {total}")


if __name__ == "__main__":
    main()
