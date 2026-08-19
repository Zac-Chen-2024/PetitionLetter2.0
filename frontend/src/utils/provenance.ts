import type { ProvenanceIndex, SentenceWithProvenance } from '../types';

/** Rebuild the sentence-index lookup after any change to a section's sentence array. */
export function buildProvenanceIndex(sentences: SentenceWithProvenance[]): ProvenanceIndex {
  const index: ProvenanceIndex = { bySubArgument: {}, byArgument: {}, bySnippet: {} };
  sentences.forEach((sent, idx) => {
    if (sent.subargument_id) (index.bySubArgument[sent.subargument_id] ??= []).push(idx);
    if (sent.argument_id) (index.byArgument[sent.argument_id] ??= []).push(idx);
    (sent.snippet_ids || []).forEach((sid) => (index.bySnippet[sid] ??= []).push(idx));
  });
  return index;
}

/** Letter text = live sentences only (removed markers are display-only). */
export function joinLiveSentences(sentences: SentenceWithProvenance[]): string {
  return sentences.filter((s) => s.changeStatus !== 'removed').map((s) => s.text).join(' ');
}
