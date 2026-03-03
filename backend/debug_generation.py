"""
Debug script: run the V3 petition writing pipeline step-by-step
and save intermediate results to debug_output/ for inspection.

Usage:
    cd backend
    python debug_generation.py
"""

import asyncio
import json
import sys
import os
from pathlib import Path
from datetime import datetime

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.petition_writer_v3 import (
    load_subargument_context,
    load_exhibit_pages_for_argument,
    _step1_generate_argument_body,
    _step2_polish_argument,
    _step3_generate_section_frame,
    _backfill_snippet_ids,
    load_registry,
    PROJECTS_DIR,
)

# ========== CONFIG ==========
PROJECT_ID = "yaruo_qu"
STANDARD_KEY = "original_contribution"
PROVIDER = "deepseek"

OUTPUT_DIR = Path(__file__).parent / "debug_output"
OUTPUT_DIR.mkdir(exist_ok=True)


def save_step(name: str, data):
    """Save a step's output as pretty JSON."""
    path = OUTPUT_DIR / f"{name}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)
    print(f"  -> Saved: {path.name} ({path.stat().st_size:,} bytes)")


def analyze_exhibit_refs(sentences, label=""):
    """Print exhibit_refs statistics for a list of sentences."""
    total = len(sentences)
    with_refs = sum(1 for s in sentences if s.get("exhibit_refs"))
    with_snippets = sum(1 for s in sentences if s.get("snippet_ids"))
    # Check if text contains [Exhibit ...] patterns
    import re
    exhibit_in_text = sum(
        1 for s in sentences
        if re.search(r'\[Exhibit\s+[A-Z0-9]', s.get("text", ""))
    )
    exhibit_inline = sum(
        1 for s in sentences
        if re.search(r'Exhibit\s+[A-Z0-9]', s.get("text", ""))
    )
    print(f"  [{label}] {total} sentences:")
    print(f"    exhibit_refs field populated: {with_refs}/{total}")
    print(f"    snippet_ids field populated:  {with_snippets}/{total}")
    print(f"    text contains [Exhibit X]:    {exhibit_in_text}/{total}")
    print(f"    text mentions Exhibit (any):  {exhibit_inline}/{total}")


async def main():
    print("=" * 60)
    print(f"Debug Generation: {PROJECT_ID} / {STANDARD_KEY}")
    print(f"Provider: {PROVIDER}")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)

    # ===== Step 0: Load Context =====
    print("\n[Step 0] Loading context...")
    context = load_subargument_context(PROJECT_ID, STANDARD_KEY)
    save_step("step0_context", context)

    all_arguments = context["arguments"]
    standard = context["standard"]
    print(f"  Arguments: {len(all_arguments)}")
    for arg in all_arguments:
        subs = arg.get("sub_arguments", [])
        total_snips = sum(len(s.get("snippets", [])) for s in subs)
        print(f"    {arg['id']}: {len(subs)} subargs, {total_snips} snippets")

    # Build snippet map
    snippet_map = {}
    for arg in all_arguments:
        for sa in arg.get("sub_arguments", []):
            for snip in sa.get("snippets", []):
                snippet_map[snip["id"]] = snip

    # ===== Step 1: Per-Argument Body Generation =====
    per_argument_bodies = []
    per_argument_refs = []

    for arg_idx, argument in enumerate(all_arguments):
        arg_id = argument.get("id", "")
        sub_arguments = argument.get("sub_arguments", [])
        if not sub_arguments:
            print(f"\n[Step 1] Skipping argument {arg_id}: no sub_arguments")
            continue

        # Load OCR
        exhibit_texts = load_exhibit_pages_for_argument(PROJECT_ID, argument, snippet_map)
        print(f"\n[Step 1] Generating body for argument {arg_id}")
        print(f"  SubArguments: {len(sub_arguments)}")
        print(f"  Exhibits loaded: {list(exhibit_texts.keys())}")
        print(f"  Total OCR chars: {sum(len(v) for v in exhibit_texts.values()):,}")

        save_step(f"step1_input_exhibit_texts_arg{arg_idx}", {
            "argument_id": arg_id,
            "exhibit_ids": list(exhibit_texts.keys()),
            "exhibit_texts": {k: v[:500] + "..." for k, v in exhibit_texts.items()},  # truncated
        })

        # Call Step 1
        arg_bodies = await _step1_generate_argument_body(
            standard=standard,
            argument=argument,
            exhibit_texts=exhibit_texts,
            provider=PROVIDER,
        )

        save_step(f"step1_output_arg{arg_idx}", {
            "argument_id": arg_id,
            "bodies": arg_bodies,
        })

        # Analyze
        all_sents = []
        for body in arg_bodies:
            all_sents.extend(body.get("sentences", []))
        analyze_exhibit_refs(all_sents, f"Step1 arg{arg_idx}")

        per_argument_bodies.append(arg_bodies)
        per_argument_refs.append(argument)

    # ===== Step 2: Per-Argument Polishing =====
    polished_bodies = []

    for i, arg_bodies in enumerate(per_argument_bodies):
        argument_ref = per_argument_refs[i]
        arg_id = argument_ref.get("id", "")
        print(f"\n[Step 2] Polishing argument {arg_id} ({len(arg_bodies)} subargs)")

        polished = await _step2_polish_argument(
            standard=standard,
            argument=argument_ref,
            subargument_bodies=arg_bodies,
            provider=PROVIDER,
        )

        save_step(f"step2_output_arg{i}", {
            "argument_id": arg_id,
            "polished": polished,
        })

        # Analyze
        all_sents = []
        for body in polished:
            all_sents.extend(body.get("sentences", []))
        analyze_exhibit_refs(all_sents, f"Step2 arg{i}")

        polished_bodies.append(polished)

    # ===== Step 3: Opening/Closing =====
    print(f"\n[Step 3] Generating opening/closing...")
    frame = await _step3_generate_section_frame(
        standard=standard,
        arguments=all_arguments,
        provider=PROVIDER,
    )
    save_step("step3_frame", frame)
    print(f"  Opening: {len(frame.get('opening_text', ''))} chars")
    print(f"  Closing: {len(frame.get('closing_text', ''))} chars")

    # ===== Step 4: Assembly =====
    print(f"\n[Step 4] Assembling final sentences...")
    all_sentences = []

    # Opening
    all_sentences.append({
        "text": frame["opening_text"],
        "snippet_ids": [],
        "subargument_id": None,
        "argument_id": all_arguments[0].get("id", ""),
        "exhibit_refs": [],
        "sentence_type": "opening",
    })

    # Body
    for arg_idx, arg_polished in enumerate(polished_bodies):
        arg_id = per_argument_refs[arg_idx].get("id", "")
        for body in arg_polished:
            subarg_id = body["subargument_id"]
            for sent in body.get("sentences", []):
                all_sentences.append({
                    "text": sent.get("text", ""),
                    "snippet_ids": sent.get("snippet_ids", []),
                    "subargument_id": subarg_id,
                    "argument_id": arg_id,
                    "exhibit_refs": sent.get("exhibit_refs", []),
                    "sentence_type": "body",
                })

    # Closing
    all_sentences.append({
        "text": frame["closing_text"],
        "snippet_ids": [],
        "subargument_id": None,
        "argument_id": all_arguments[-1].get("id", ""),
        "exhibit_refs": [],
        "sentence_type": "closing",
    })

    save_step("step4_assembled", all_sentences)
    analyze_exhibit_refs(all_sentences, "Step4 assembled")

    # ===== Step 5: Backfill =====
    print(f"\n[Step 5] Running backfill...")
    snippet_registry = load_registry(PROJECT_ID)
    if not snippet_registry:
        combined_file = PROJECTS_DIR / PROJECT_ID / "extraction" / "combined_extraction.json"
        if combined_file.exists():
            with open(combined_file, "r", encoding="utf-8") as f:
                snippet_registry = json.load(f).get("snippets", [])

    print(f"  Snippet registry: {len(snippet_registry)} entries")
    backfilled = _backfill_snippet_ids(all_sentences, snippet_registry)
    print(f"  Backfilled: {backfilled} sentences")

    save_step("step5_final", all_sentences)
    analyze_exhibit_refs(all_sentences, "Step5 final")

    # ===== Summary =====
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for sent in all_sentences:
        text_preview = sent["text"][:80] + "..." if len(sent["text"]) > 80 else sent["text"]
        refs = sent.get("exhibit_refs", [])
        snips = sent.get("snippet_ids", [])
        has_exhibit_text = "Exhibit" in sent.get("text", "")
        status = "OK" if refs else ("TEXT_ONLY" if has_exhibit_text else "MISSING")
        print(f"  [{status:9}] refs={len(refs):2d} snips={len(snips):2d} | {text_preview}")


if __name__ == "__main__":
    asyncio.run(main())
