/**
 * Sentence-level diff for regeneration (M13 #1).
 *
 * Aligns the previous and regenerated sentence lists so the letter can show
 * what actually changed instead of silently swapping the paragraph. Anchor
 * is (subargument_id, sentence_type); within an anchor, sentences are
 * matched by text similarity (Dice coefficient over word bigrams).
 *
 * Pure function, no React. Deterministic: ties resolve to the earliest
 * previous sentence in document order.
 */
import type { SentenceWithProvenance } from '../types';

export type DiffOp =
  | { type: 'equal'; prev: number; next: number }
  | { type: 'modified'; prev: number; next: number; similarity: number }
  | { type: 'added'; next: number }
  | { type: 'removed'; prev: number };

export const EQUAL_THRESHOLD = 0.92;
export const MODIFIED_THRESHOLD = 0.35;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ') // exhibit citations move around freely
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(text: string): Map<string, number> {
  const words = normalise(text).split(' ').filter(Boolean);
  const grams = new Map<string, number>();
  if (words.length === 1) grams.set(words[0], 1);
  for (let i = 0; i + 1 < words.length; i++) {
    const g = `${words[i]} ${words[i + 1]}`;
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** Dice similarity in [0, 1] over word bigrams. */
export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.size === 0 && gb.size === 0) return 1;
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  let total = 0;
  ga.forEach((n, g) => { total += n; inter += Math.min(n, gb.get(g) ?? 0); });
  gb.forEach((n) => { total += n; });
  return (2 * inter) / total;
}

function anchorOf(s: SentenceWithProvenance): string {
  return `${s.sentence_type ?? 'body'}::${s.subargument_id ?? ''}`;
}

/**
 * Align `prev` and `next`. Every index of both lists appears in exactly one op.
 * Ops are ordered for display: next-order, with removed prev sentences
 * emitted just before the first later-matched prev sentence.
 */
export function diffSentences(prev: SentenceWithProvenance[], next: SentenceWithProvenance[]): DiffOp[] {
  const prevByAnchor = new Map<string, number[]>();
  prev.forEach((s, i) => (prevByAnchor.get(anchorOf(s)) ?? prevByAnchor.set(anchorOf(s), []).get(anchorOf(s))!).push(i));

  const usedPrev = new Set<number>();
  const matchOfNext = new Map<number, { prev: number; sim: number }>();

  // Greedy best-match: for each next sentence pick the most similar unused prev
  // sentence under the same anchor. Process pairs globally by similarity so
  // a strong match is never stolen by an earlier weaker one.
  const candidates: { next: number; prev: number; sim: number }[] = [];
  next.forEach((n, ni) => {
    (prevByAnchor.get(anchorOf(n)) ?? []).forEach((pi) => {
      const sim = textSimilarity(prev[pi].text, n.text);
      if (sim >= MODIFIED_THRESHOLD) candidates.push({ next: ni, prev: pi, sim });
    });
  });
  candidates.sort((a, b) => b.sim - a.sim || a.prev - b.prev || a.next - b.next);
  for (const c of candidates) {
    if (usedPrev.has(c.prev) || matchOfNext.has(c.next)) continue;
    usedPrev.add(c.prev);
    matchOfNext.set(c.next, { prev: c.prev, sim: c.sim });
  }

  // Emit in next order; interleave removed prev sentences before the next
  // matched prev index that follows them.
  const ops: DiffOp[] = [];
  const emittedPrev = new Set<number>();
  let cursor = 0; // prev sentences < cursor already handled (matched or removed)

  const flushRemovedBefore = (limit: number) => {
    for (let pi = cursor; pi < limit; pi++) {
      if (!usedPrev.has(pi) && !emittedPrev.has(pi)) {
        ops.push({ type: 'removed', prev: pi });
        emittedPrev.add(pi);
      }
    }
    cursor = Math.max(cursor, limit);
  };

  next.forEach((_, ni) => {
    const m = matchOfNext.get(ni);
    if (!m) {
      ops.push({ type: 'added', next: ni });
      return;
    }
    flushRemovedBefore(m.prev);
    emittedPrev.add(m.prev);
    if (m.sim >= EQUAL_THRESHOLD) ops.push({ type: 'equal', prev: m.prev, next: ni });
    else ops.push({ type: 'modified', prev: m.prev, next: ni, similarity: m.sim });
    if (m.prev + 1 > cursor) cursor = m.prev + 1;
  });
  flushRemovedBefore(prev.length);
  return ops;
}

export interface DiffSummary {
  added: number;
  modified: number;
  removed: number;
  equal: number;
}

export function summarise(ops: DiffOp[]): DiffSummary {
  const s: DiffSummary = { added: 0, modified: 0, removed: 0, equal: 0 };
  ops.forEach((op) => { s[op.type] += 1; });
  return s;
}

/**
 * Produce the display list for a regeneration: the new sentences carrying
 * `changeStatus` markers, with removed previous sentences interleaved
 * (status 'removed') so the reader sees what went away. Equal sentences
 * keep the *previous* object (preserving isEdited/originalText etc.).
 */
export function markRegeneration(
  prev: SentenceWithProvenance[],
  next: SentenceWithProvenance[],
): { sentences: SentenceWithProvenance[]; ops: DiffOp[]; summary: DiffSummary } {
  const ops = diffSentences(prev, next);
  const sentences: SentenceWithProvenance[] = ops.map((op) => {
    switch (op.type) {
      case 'equal':
        return { ...prev[op.prev], ...next[op.next], text: prev[op.prev].text, changeStatus: null, previousText: undefined };
      case 'modified':
        return { ...next[op.next], changeStatus: 'modified', previousText: prev[op.prev].text };
      case 'added':
        return { ...next[op.next], changeStatus: 'added', previousText: undefined };
      case 'removed':
        return { ...prev[op.prev], changeStatus: 'removed' };
    }
  });
  return { sentences, ops, summary: summarise(ops) };
}
