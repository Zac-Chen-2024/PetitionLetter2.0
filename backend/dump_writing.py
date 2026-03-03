"""Dump all writing outputs for expert review."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, '.')
from app.services.petition_writer_v3 import load_latest_writing_v3

for project in ['xiaoyang_wang', 'chen_zhen']:
    print()
    print('=' * 80)
    print(f'PROJECT: {project}')
    print('=' * 80)
    for prong in ['prong1_merit', 'prong2_positioned', 'prong3_balance']:
        w = load_latest_writing_v3(project, prong)
        if not w:
            print(f'\n--- {prong}: NOT FOUND ---')
            continue
        sents = w.get('sentences', [])
        body = [s for s in sents if s.get('sentence_type') == 'body']
        opening = [s for s in sents if s.get('sentence_type') == 'opening']
        closing = [s for s in sents if s.get('sentence_type') == 'closing']

        print(f'\n--- {prong} ({len(body)} body sentences) ---')

        if opening:
            print(f'\n[OPENING] {opening[0]["text"]}')

        current_subarg = None
        for s in body:
            sa = s.get('subargument_id', '')
            if sa != current_subarg:
                current_subarg = sa
                print(f'\n  [SubArg: {current_subarg}]')
            refs = s.get('exhibit_refs', [])
            snips = len(s.get('snippet_ids', []))
            print(f'    [{snips} snips | {refs}]')
            print(f'    {s["text"]}')

        if closing:
            print(f'\n[CLOSING] {closing[0]["text"]}')
