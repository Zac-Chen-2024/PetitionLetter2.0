/**
 * Evidence coverage overview (M13).
 *
 * States facts about the current structure — unassigned snippets, thin
 * SubArguments, evidence-layer gaps per Standard — and lets the user jump
 * to the node in question. No scores, no recommendations: the judgement
 * stays with the user.
 */
import { useMemo, useState } from 'react';
import { useCoverageQuery } from '../../api/hooks';
import type { CoverageStandard } from '../../api/types';
import { STANDARD_KEY_TO_ID } from '../../constants/colors';

const LAYERS = ['claim', 'proof', 'significance', 'context'] as const;
const LAYER_LABEL: Record<string, string> = {
  claim: 'Claim',
  proof: 'Proof',
  significance: 'Significance',
  context: 'Context',
};

export interface CoveragePanelStandard {
  id: string;
  name: string;
  shortName: string;
  color: string;
}

interface CoveragePanelProps {
  projectId: string;
  standards: CoveragePanelStandard[];
  onClose: () => void;
  onNavigateToStandard: (standardId: string) => void;
  onSelectSubArgument: (subArgumentId: string) => void;
  onSelectSnippet: (snippetId: string) => void;
}

export function CoveragePanel({
  projectId,
  standards,
  onClose,
  onNavigateToStandard,
  onSelectSubArgument,
  onSelectSnippet,
}: CoveragePanelProps) {
  const { data, isLoading, isError, refetch } = useCoverageQuery(projectId);
  const [showUnassigned, setShowUnassigned] = useState(false);

  const standardById = useMemo(() => new Map(standards.map((s) => [s.id, s])), [standards]);
  const resolveStandard = (key: string) => standardById.get(STANDARD_KEY_TO_ID[key] ?? key);

  return (
    <div className="absolute top-3 right-14 z-50 w-80 max-h-[calc(100%-1.5rem)] flex flex-col bg-white rounded-lg shadow-lg border border-slate-200 text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <div className="font-semibold text-slate-700">Evidence coverage</div>
        <div className="flex items-center gap-1">
          <button onClick={() => refetch()} className="px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 rounded" title="Refresh">
            ↻
          </button>
          <button onClick={onClose} className="px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 rounded" title="Close">
            ✕
          </button>
        </div>
      </div>

      <div className="overflow-y-auto p-3 space-y-3">
        {isLoading && <div className="text-slate-400">Loading…</div>}
        {isError && <div className="text-red-500">Could not load coverage.</div>}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Snippets" value={data.totals.snippets} />
              <Stat label="Assigned" value={data.totals.assigned_snippets} />
              <Stat label="Unassigned" value={data.totals.unassigned_snippets} tone={data.totals.unassigned_snippets > 0 ? 'amber' : 'slate'} />
            </div>

            {data.standards.map((std) => (
              <StandardBlock
                key={std.standard_key}
                std={std}
                meta={resolveStandard(std.standard_key)}
                onNavigateToStandard={onNavigateToStandard}
                onSelectSubArgument={onSelectSubArgument}
              />
            ))}

            {data.totals.unassigned_snippets > 0 && (
              <div>
                <button
                  onClick={() => setShowUnassigned((v) => !v)}
                  className="w-full flex items-center justify-between px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-800"
                >
                  <span>Unassigned snippets ({data.totals.unassigned_snippets})</span>
                  <span className="text-[10px]">
                    {Object.entries(data.unassigned_by_exhibit).map(([ex, n]) => `${ex}:${n}`).join(' ')}
                  </span>
                </button>
                {showUnassigned && (
                  <ul className="mt-1 space-y-1 max-h-60 overflow-y-auto">
                    {data.unassigned_snippets.map((s) => (
                      <li key={s.snippet_id}>
                        <button
                          onClick={() => onSelectSnippet(s.snippet_id)}
                          className="w-full text-left px-2 py-1 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200"
                          title={s.text}
                        >
                          <span className="font-mono text-[10px] text-slate-500 mr-1">
                            {s.exhibit_id}
                            {s.page != null ? ` p${s.page}` : ''}
                          </span>
                          {s.evidence_layer && <span className="text-[10px] text-slate-400 mr-1">[{LAYER_LABEL[s.evidence_layer] ?? s.evidence_layer}]</span>}
                          <span className="text-slate-700 line-clamp-2">{s.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'amber' }) {
  const cls = tone === 'amber' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <div className={`rounded border px-1 py-1 ${cls}`}>
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] opacity-70">{label}</div>
    </div>
  );
}

function StandardBlock({
  std,
  meta,
  onNavigateToStandard,
  onSelectSubArgument,
}: {
  std: CoverageStandard;
  meta: CoveragePanelStandard | undefined;
  onNavigateToStandard: (standardId: string) => void;
  onSelectSubArgument: (subArgumentId: string) => void;
}) {
  const thin = [...std.empty_subarguments, ...std.single_evidence_subarguments];
  return (
    <div className="border border-slate-200 rounded">
      <button
        onClick={() => meta && onNavigateToStandard(meta.id)}
        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-t"
        title={meta?.name ?? std.standard_key}
      >
        <span className="flex items-center gap-1.5 font-medium text-slate-700 truncate">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta?.color ?? '#94a3b8' }} />
          <span className="truncate">{meta?.shortName ?? std.standard_key}</span>
        </span>
        <span className="text-[10px] text-slate-500 whitespace-nowrap">
          {std.argument_count} arg · {std.subargument_count} sub · {std.snippet_count} snip
        </span>
      </button>

      <div className="px-2 pb-2 space-y-1.5">
        {/* Evidence layers present / absent (facts, not a score) */}
        <div className="flex flex-wrap gap-1">
          {LAYERS.map((layer) => {
            const n = std.layer_counts[layer] ?? 0;
            const gap = n === 0;
            return (
              <span
                key={layer}
                className={`px-1.5 py-0.5 rounded border text-[10px] ${
                  gap ? 'border-dashed border-slate-300 text-slate-400' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
                title={gap ? `No ${LAYER_LABEL[layer]} snippet assigned under this standard` : `${n} ${LAYER_LABEL[layer]} snippet(s)`}
              >
                {LAYER_LABEL[layer]} {gap ? '—' : n}
              </span>
            );
          })}
        </div>

        {thin.length > 0 && (
          <ul className="space-y-0.5">
            {thin.map((sa) => (
              <li key={sa.id}>
                <button
                  onClick={() => onSelectSubArgument(sa.id)}
                  className="w-full text-left flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-50"
                  title={sa.title}
                >
                  <span
                    className={`px-1 rounded text-[10px] font-mono ${
                      sa.snippet_count === 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {sa.snippet_count}
                  </span>
                  <span className="truncate text-slate-600">{sa.title || '(untitled)'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
