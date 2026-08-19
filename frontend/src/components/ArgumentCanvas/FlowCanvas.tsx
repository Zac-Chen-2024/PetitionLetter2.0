/**
 * FlowCanvas — react-flow (@xyflow/react) renderer for the Writing Tree (M12).
 *
 * The domain logic (selection, merge/move/consolidate modes, modals, context
 * menu, all mutations) lives in ArgumentGraph.tsx and is passed in as props;
 * this component only knows how to draw Standard / Argument / SubArgument
 * nodes and their edges, and delegates every interaction back.
 *
 * What react-flow gives for free here (previously hand-written): pan/zoom,
 * drag, multi-select + box select, keyboard arrow-key node movement, minimap,
 * fit-view, and edge routing. Node positions use nodeOrigin [0.5, 0.5] so
 * they keep the "center point" semantics of calculateTreeLayout.
 */
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Handle,
  MiniMap,
  Position as FlowPosition,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { TFunction } from 'i18next';
import type { Argument, FocusState, Position } from '../../types';
import { STANDARD_KEY_TO_ID } from '../../constants/colors';
import type { ArgumentNode as ArgLayoutNode, StandardNode as StdLayoutNode, SubArgumentNode as SubLayoutNode } from '../ArgumentGraph';

// ---------------------------------------------------------------------------
// Public API exposed to the shell (zoom buttons, minimap navigation, centering)
// ---------------------------------------------------------------------------

export interface FlowCanvasApi {
  zoomBy: (delta: number) => void;
  zoom: () => number;
  fitView: () => void;
  centerOn: (x: number, y: number, zoom?: number) => void;
}

export interface FlowCanvasProps {
  t: TFunction;
  standardNodes: StdLayoutNode[];
  argumentNodes: ArgLayoutNode[];
  subArgumentNodes: SubLayoutNode[];
  contextArguments: Argument[];
  projectId: string;
  focusState: FocusState;
  selectedNodeId: string | null;
  isSubArgumentHighlighted: (node: SubLayoutNode) => boolean;
  // modes
  isMergeMode: boolean;
  isMoveMode: boolean;
  isConsolidateMode: boolean;
  mergeSelectedIds: Set<string>;
  mergeLockedStandardKey: string | null;
  moveTargetArgumentIds: Set<string>;
  // per-node status
  rewritingStandardKey: string | null;
  rewritingArgId: string | null;
  generatedStandardIds: Set<string>;
  newlyCreatedSubArgId: string | null;
  transformVersion: number;
  // handlers (same as the legacy canvas)
  onNodeDrag: (id: string, position: Position) => void;
  onArgumentPositionReport: (id: string, rect: DOMRect) => void;
  onSubArgumentPositionReport: (id: string, rect: DOMRect) => void;
  onStandardSelect: (id: string) => void;
  onArgumentSelect: (id: string) => void;
  onSubArgumentSelect: (id: string) => void;
  onMergeToggle: (id: string) => void;
  onMoveTarget: (argumentId: string) => void;
  onSubArgumentTitleChange: (id: string, title: string) => void;
  onSubArgumentRegenerate: (id: string) => void;
  onSubArgumentDelete: (id: string) => void;
  onSubArgumentCancelCreate: (id: string) => void;
  onAutoEditComplete: () => void;
  onAddSubArgument: (argumentId: string) => void;
  onArgumentDelete: (argumentId: string) => void;
  onArgumentAITitle: (argumentId: string) => void;
  onArgumentRewrite: (argumentId: string) => void;
  onStandardRewrite: (standardKey: string) => void;
  onStandardRemove: (standardKey: string) => void;
  onStandardRegenerate: (standardKey: string) => void;
  onAddArgument: (standardKey: string) => void;
  onContextMenu: (e: React.MouseEvent, nodeType: 'standard' | 'argument' | 'subargument', nodeId: string, standardKey?: string) => void;
  onSubArgAITitle: (subArgumentId: string, argumentId: string, currentTitle: string) => Promise<string | null>;
  onZoomChange?: (zoom: number) => void;
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const Spinner = ({ className }: { className: string }) => (
  <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
const IconPlus = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
);
const IconBolt = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
);
const IconRefresh = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
);
const IconTrash = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);

/** Report this node's screen rect to the shell whenever the viewport moves
 *  (ConnectionLines draws snippet -> sub-argument lines in screen space). */
function usePositionReport(id: string, ref: React.RefObject<HTMLDivElement | null>, report?: (id: string, rect: DOMRect) => void, version?: number) {
  const vp = useViewport();
  useEffect(() => {
    if (!report || !ref.current) return;
    report(id, ref.current.getBoundingClientRect());
  }, [id, ref, report, vp.x, vp.y, vp.zoom, version]);
}

const invisibleHandle = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 } as const;

// ---------------------------------------------------------------------------
// Standard node
// ---------------------------------------------------------------------------

type StdData = StdLayoutNode['data'] & {
  t: TFunction;
  isSelected: boolean;
  isRewriting: boolean;
  hasLetterContent: boolean;
  onRewrite: (id: string) => void;
  onRemove: (id: string) => void;
  onRegenerate: (id: string) => void;
  onAddArgument: (id: string) => void;
};

const StdNode = memo(function StdNode({ id, data }: NodeProps<Node<StdData>>) {
  const { t } = data;
  return (
    <div
      className={`w-[240px] p-4 rounded-xl bg-white shadow-lg transition-all ${data.isSelected ? 'ring-2 ring-offset-2 shadow-xl' : 'hover:shadow-xl'}`}
      style={{ borderColor: data.color, borderWidth: 3, borderStyle: 'solid' }}
    >
      <Handle type="target" position={FlowPosition.Left} style={invisibleHandle} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: data.color }} />
          <span className="text-base font-bold text-slate-800">{data.shortName}</span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 -mt-1 -mr-1 nodrag">
          <button onClick={(e) => { e.stopPropagation(); data.onAddArgument(id); }} className="p-1 rounded hover:bg-purple-100" title={t('graph.standard.addArgument', 'Add Argument')}>
            <IconPlus className="w-3.5 h-3.5 text-purple-600" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); data.onRewrite(id); }} disabled={data.isRewriting} className="p-1 rounded hover:bg-emerald-100 disabled:opacity-50" title={t('graph.standard.rewrite', 'Rewrite')}>
            {data.isRewriting ? <Spinner className="w-3.5 h-3.5 text-emerald-600" /> : <IconRefresh className="w-3.5 h-3.5 text-emerald-600" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); data.onRegenerate(id); }} className="p-1 rounded hover:bg-amber-100" title={t('graph.standard.regenerate', 'Regenerate arguments for this standard')}>
            <IconBolt className="w-3.5 h-3.5 text-amber-600" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); data.onRemove(id); }} className="p-1 rounded hover:bg-red-100" title={t('graph.standard.remove', 'Remove')}>
            <IconTrash className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{t('graph.legend.standard')}</span>
          {data.hasLetterContent ? (
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><title>{t('graph.standard.written', 'Written')}</title><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><title>{t('graph.standard.pending', 'Not written')}</title><circle cx="12" cy="12" r="9" strokeWidth={2} /></svg>
          )}
        </div>
        <span className="text-xs text-slate-500">{data.argumentCount} args</span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Argument node
// ---------------------------------------------------------------------------

type ArgData = ArgLayoutNode['data'] & {
  t: TFunction;
  isSelected: boolean;
  isRewriting: boolean;
  isMoveMode: boolean;
  isMoveTarget: boolean;
  onAddSubArgument: (id: string) => void;
  onDelete: (id: string) => void;
  onAITitle: (id: string) => void;
  onRewrite: (id: string) => void;
  onPositionReport?: (id: string, rect: DOMRect) => void;
  transformVersion: number;
};

function completenessColor(score?: number) {
  if (!score) return 'bg-slate-200';
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-400';
}

const ArgNode = memo(function ArgNode({ id, data }: NodeProps<Node<ArgData>>) {
  const { t } = data;
  const ref = useRef<HTMLDivElement>(null);
  usePositionReport(id, ref, data.onPositionReport, data.transformVersion);
  return (
    <div
      ref={ref}
      style={{ opacity: data.isMoveMode && !data.isMoveTarget ? 0.4 : 1 }}
      className={`w-[400px] p-4 rounded-xl border-2 shadow-md transition-all ${
        data.isMoveMode && data.isMoveTarget
          ? 'border-purple-500 bg-purple-100 ring-2 ring-purple-400 ring-offset-2 shadow-lg cursor-pointer'
          : data.isMoveMode
            ? 'border-slate-300 bg-slate-100 cursor-not-allowed'
            : data.isSelected
              ? 'ring-2 ring-offset-2 ring-purple-500 shadow-lg border-purple-500 bg-purple-50'
              : 'border-purple-400 bg-purple-50 hover:shadow-lg hover:border-purple-500'
      }`}
    >
      <Handle type="target" position={FlowPosition.Left} style={invisibleHandle} />
      <Handle type="source" position={FlowPosition.Right} style={invisibleHandle} />
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-base font-bold text-purple-800 line-clamp-3">{data.title}</span>
        {!data.isMoveMode && (
          <div className="flex items-center gap-0.5 flex-shrink-0 -mt-1 -mr-1 nodrag">
            <button onClick={(e) => { e.stopPropagation(); data.onAddSubArgument(id); }} className="p-1 rounded hover:bg-purple-200" title="Add Sub-Argument"><IconPlus className="w-4 h-4 text-purple-600" /></button>
            <button onClick={(e) => { e.stopPropagation(); data.onAITitle(id); }} className="p-1 rounded hover:bg-purple-100" title="AI generate title"><IconBolt className="w-3.5 h-3.5 text-purple-500" /></button>
            <button onClick={(e) => { e.stopPropagation(); data.onRewrite(id); }} disabled={data.isRewriting} className="p-1 rounded hover:bg-emerald-100 disabled:opacity-50" title="Rewrite letter content">
              {data.isRewriting ? <Spinner className="w-3.5 h-3.5 text-emerald-600" /> : <IconRefresh className="w-3.5 h-3.5 text-emerald-600" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); data.onDelete(id); }} className="p-1 rounded hover:bg-red-100" title="Delete this argument"><IconTrash className="w-3.5 h-3.5 text-red-500" /></button>
          </div>
        )}
      </div>
      <div className="mt-auto pt-2 flex items-end justify-between">
        {data.standardKey ? <span className="text-xs px-2 py-1 bg-purple-200 text-purple-700 rounded-full">{data.standardKey}</span> : <span />}
        <div className="flex items-center gap-2 text-xs">
          {data.completenessScore !== undefined && (
            <div className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-full ${completenessColor(data.completenessScore)}`} />
              <span className="text-purple-500">{data.completenessScore}%</span>
            </div>
          )}
          <span className="text-purple-500">{t('graph.node.snippets', { count: data.snippetCount })}</span>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// SubArgument node (inline title edit, AI title, regenerate, delete, merge checkbox)
// ---------------------------------------------------------------------------

type SubData = SubLayoutNode['data'] & {
  t: TFunction;
  isSelected: boolean;
  mergeMode: boolean;
  mergeChecked: boolean;
  mergeDisabled: boolean;
  autoEdit: boolean;
  onAutoEditComplete: () => void;
  onTitleChange?: (id: string, title: string) => void;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCancelCreate?: (id: string) => void;
  onAITitle: (subArgumentId: string, argumentId: string, currentTitle: string) => Promise<string | null>;
  onPositionReport?: (id: string, rect: DOMRect) => void;
  transformVersion: number;
};

const SubNode = memo(function SubNode({ id, data }: NodeProps<Node<SubData>>) {
  const { t } = data;
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(data.title);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isAI, setIsAI] = useState(false);
  usePositionReport(id, ref, data.onPositionReport, data.transformVersion);

  useEffect(() => { if (!isEditing) setEditTitle(data.title); }, [data.title, isEditing, setEditTitle]);
  useEffect(() => {
    if (data.autoEdit && !isEditing) {
      setIsEditing(true);
      setEditTitle(data.title);
      data.onAutoEditComplete();
    }
  }, [data, isEditing, setEditTitle, setIsEditing]);
  useEffect(() => { if (isEditing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [isEditing]);

  const save = () => {
    const title = editTitle.trim();
    if (title && title !== data.title) data.onTitleChange?.(id, title);
    if (!title && !data.title) data.onCancelCreate?.(id);
    setIsEditing(false);
  };
  const cancel = () => {
    if (!data.title) data.onCancelCreate?.(id);
    setEditTitle(data.title);
    setIsEditing(false);
  };

  return (
    <div
      ref={ref}
      className={`w-[320px] p-3 rounded-lg border-2 shadow-sm transition-all ${
        data.mergeMode && data.mergeDisabled ? 'border-slate-300 bg-slate-100 opacity-40 cursor-not-allowed' : ''
      } ${data.mergeMode && !data.mergeDisabled && data.mergeChecked ? 'border-amber-500 bg-amber-50 ring-2 ring-offset-2 ring-amber-400 shadow-md' : ''} ${
        data.mergeMode && !data.mergeDisabled && !data.mergeChecked ? 'border-emerald-400 bg-emerald-50 hover:border-amber-400 cursor-pointer' : ''
      } ${!data.mergeMode && data.isSelected ? 'border-emerald-500 ring-2 ring-offset-2 ring-emerald-500 shadow-md bg-emerald-50' : ''} ${
        !data.mergeMode && !data.isSelected ? 'border-emerald-400 bg-emerald-50 hover:shadow-md hover:border-emerald-500' : ''
      }`}
    >
      <Handle type="source" position={FlowPosition.Right} style={invisibleHandle} />
      <div className="flex items-start justify-between gap-2 mb-1">
        {data.mergeMode && !data.mergeDisabled && (
          <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${data.mergeChecked ? 'border-amber-500 bg-amber-500' : 'border-slate-300'}`}>
            {data.mergeChecked && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            )}
          </div>
        )}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') cancel(); e.stopPropagation(); }}
            onBlur={save}
            onClick={(e) => e.stopPropagation()}
            className="nodrag flex-1 text-sm font-semibold text-emerald-800 bg-white border border-emerald-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        ) : (
          <span
            className="text-sm font-semibold text-emerald-800 line-clamp-2 cursor-text hover:bg-emerald-100 rounded px-1 -mx-1"
            onDoubleClick={(e) => { if (!data.mergeMode && data.onTitleChange) { e.stopPropagation(); setEditTitle(data.title); setIsEditing(true); } }}
            title="Double-click to edit"
          >
            {data.title}
          </span>
        )}
        {!data.mergeMode && (
          <div className="flex items-center gap-0.5 flex-shrink-0 -mt-0.5 -mr-0.5 nodrag">
            {data.needsSnippetConfirmation && (
              <span className="relative flex items-center justify-center w-5 h-5" title={`${data.pendingSnippetCount || 0} snippets to confirm`}>
                <span className="absolute inline-flex h-3 w-3 rounded-full bg-red-500 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
            )}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (isAI) return;
                setIsAI(true);
                try {
                  const title = await data.onAITitle(id, data.argumentId, data.title || editTitle || 'merged sub-argument');
                  if (title) { setEditTitle(title); if (!isEditing) data.onTitleChange?.(id, title); }
                } finally { setIsAI(false); }
              }}
              disabled={isAI}
              className="p-1 rounded hover:bg-purple-100 disabled:opacity-50"
              title="AI generate title"
            >
              {isAI ? <Spinner className="w-3.5 h-3.5 text-purple-500" /> : <IconBolt className="w-3.5 h-3.5 text-purple-500" />}
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (isRegenerating || !data.onRegenerate) return;
                setIsRegenerating(true);
                try { await data.onRegenerate(id); } finally { setIsRegenerating(false); }
              }}
              disabled={isRegenerating}
              className="p-1 rounded hover:bg-emerald-200 disabled:opacity-50"
              title="Regenerate this section"
            >
              {isRegenerating ? <Spinner className="w-3.5 h-3.5 text-emerald-600" /> : <IconRefresh className="w-3.5 h-3.5 text-emerald-600" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); data.onDelete?.(id); }} className="p-1 rounded hover:bg-red-100" title="Delete this sub-argument">
              <IconTrash className="w-3.5 h-3.5 text-red-500" />
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-emerald-600 mb-2 line-clamp-2">{data.purpose}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-0.5 bg-emerald-200 text-emerald-700 rounded-full text-[10px]">{data.relationship}</span>
        <span className="text-emerald-500">{t('graph.node.snippets', { count: data.snippetCount })}</span>
      </div>
    </div>
  );
});


const nodeTypes: NodeTypes = { standard: StdNode, argument: ArgNode, subargument: SubNode };

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

const FlowCanvasInner = forwardRef<FlowCanvasApi, FlowCanvasProps>(function FlowCanvasInner(props, ref) {
  const rf = useReactFlow();
  const {
    t, standardNodes, argumentNodes, subArgumentNodes, contextArguments, focusState, selectedNodeId,
    isSubArgumentHighlighted, isMergeMode, isMoveMode, isConsolidateMode, mergeSelectedIds,
    mergeLockedStandardKey, moveTargetArgumentIds, rewritingStandardKey, rewritingArgId,
    generatedStandardIds, newlyCreatedSubArgId, transformVersion,
  } = props;

  useImperativeHandle(ref, () => ({
    zoomBy: (delta) => { const z = rf.getZoom(); rf.zoomTo(Math.max(0.2, Math.min(2, z + delta)), { duration: 150 }); },
    zoom: () => rf.getZoom(),
    fitView: () => { void rf.fitView({ padding: 0.15, duration: 250 }); },
    centerOn: (x, y, zoom = 0.7) => { void rf.setCenter(x, y, { zoom, duration: 250 }); },
  }), [rf]);

  // Build react-flow nodes from the layout each render (positions come from
  // calculateTreeLayout, which already includes user-dragged overrides).
  const nodes = useMemo<Node[]>(() => {
    const out: Node[] = [];
    for (const n of subArgumentNodes) {
      const parentArg = contextArguments.find(a => a.id === n.data.argumentId);
      const stdKey = parentArg?.standardKey || null;
      const mergeDisabled = isMergeMode && mergeLockedStandardKey !== null && stdKey !== mergeLockedStandardKey;
      const mergeChecked = mergeSelectedIds.has(n.id);
      out.push({
        id: n.id, type: 'subargument', position: n.position, draggable: !isMergeMode, zIndex: 1,
        data: {
          ...n.data, t,
          isSelected: isMergeMode ? mergeChecked : isSubArgumentHighlighted(n),
          mergeMode: isMergeMode, mergeChecked, mergeDisabled,
          autoEdit: n.id === newlyCreatedSubArgId, onAutoEditComplete: props.onAutoEditComplete,
          onTitleChange: isMergeMode ? undefined : props.onSubArgumentTitleChange,
          onRegenerate: isMergeMode ? undefined : props.onSubArgumentRegenerate,
          onDelete: isMergeMode ? undefined : props.onSubArgumentDelete,
          onCancelCreate: props.onSubArgumentCancelCreate,
          onAITitle: props.onSubArgAITitle,
          onPositionReport: props.onSubArgumentPositionReport,
          transformVersion,
        } satisfies SubData,
      });
    }
    for (const n of argumentNodes) {
      out.push({
        id: n.id, type: 'argument', position: n.position, zIndex: 2, draggable: !(isMoveMode || isConsolidateMode),
        data: {
          ...n.data, t,
          isSelected: selectedNodeId === n.id || focusState.id === n.id,
          isRewriting: rewritingArgId === n.id,
          isMoveMode: isMoveMode || isConsolidateMode,
          isMoveTarget: moveTargetArgumentIds.has(n.id),
          onAddSubArgument: props.onAddSubArgument, onDelete: props.onArgumentDelete,
          onAITitle: props.onArgumentAITitle, onRewrite: props.onArgumentRewrite,
          onPositionReport: props.onArgumentPositionReport, transformVersion,
        } satisfies ArgData,
      });
    }
    for (const n of standardNodes) {
      out.push({
        id: n.id, type: 'standard', position: n.position, zIndex: 3,
        data: {
          ...n.data, t,
          isSelected: selectedNodeId === n.id || focusState.id === n.id,
          isRewriting: rewritingStandardKey === n.id,
          hasLetterContent: generatedStandardIds.has(n.id),
          onRewrite: props.onStandardRewrite, onRemove: props.onStandardRemove,
          onRegenerate: props.onStandardRegenerate, onAddArgument: props.onAddArgument,
        } satisfies StdData,
      });
    }
    return out;
  }, [subArgumentNodes, argumentNodes, standardNodes, contextArguments, t, isMergeMode, mergeLockedStandardKey,
    mergeSelectedIds, isSubArgumentHighlighted, newlyCreatedSubArgId, props, transformVersion, selectedNodeId,
    focusState.id, rewritingArgId, isMoveMode, isConsolidateMode, moveTargetArgumentIds, rewritingStandardKey, generatedStandardIds]);

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    const argIds = new Set(argumentNodes.map(n => n.id));
    const stdIds = new Set(standardNodes.map(n => n.id));
    for (const sa of subArgumentNodes) {
      if (!argIds.has(sa.data.argumentId)) continue;
      out.push({
        id: `e-${sa.id}-${sa.data.argumentId}`, source: sa.id, target: sa.data.argumentId, type: 'default',
        label: sa.data.relationship || undefined,
        labelStyle: { fontSize: 10, fill: '#059669' }, labelBgStyle: { fill: '#ecfdf5' }, labelBgPadding: [4, 2], labelBgBorderRadius: 4,
        style: { stroke: '#10b981', strokeWidth: 2 },
      });
    }
    for (const a of argumentNodes) {
      const stdId = a.data.standardKey ? STANDARD_KEY_TO_ID[a.data.standardKey] : undefined;
      if (!stdId || !stdIds.has(stdId)) continue;
      out.push({ id: `e-${a.id}-${stdId}`, source: a.id, target: stdId, type: 'default', style: { stroke: '#a855f7', strokeWidth: 2 } });
    }
    return out;
  }, [subArgumentNodes, argumentNodes, standardNodes]);

  const onNodeClick = useCallback<NodeMouseHandler>((_e, node) => {
    if (node.type === 'subargument') {
      if (isMergeMode) {
        const parentArg = contextArguments.find(a => a.id === (node.data as SubData).argumentId);
        const stdKey = parentArg?.standardKey || null;
        const disabled = mergeLockedStandardKey !== null && stdKey !== mergeLockedStandardKey;
        if (!disabled) props.onMergeToggle(node.id);
      } else {
        props.onSubArgumentSelect(node.id);
      }
    } else if (node.type === 'argument') {
      if ((isMoveMode || isConsolidateMode) && moveTargetArgumentIds.has(node.id)) props.onMoveTarget(node.id);
      else if (!(isMoveMode || isConsolidateMode)) props.onArgumentSelect(node.id);
    } else if (node.type === 'standard') {
      props.onStandardSelect(node.id);
    }
  }, [isMergeMode, isMoveMode, isConsolidateMode, contextArguments, mergeLockedStandardKey, moveTargetArgumentIds, props]);

  const onNodeContextMenu = useCallback<NodeMouseHandler>((e, node) => {
    if (node.type === 'subargument') {
      const parentArg = contextArguments.find(a => a.id === (node.data as SubData).argumentId);
      props.onContextMenu(e, 'subargument', node.id, parentArg?.standardKey);
    } else if (node.type === 'argument') {
      props.onContextMenu(e, 'argument', node.id, (node.data as ArgData).standardKey);
    } else {
      props.onContextMenu(e, 'standard', node.id, node.id);
    }
  }, [contextArguments, props]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodeOrigin={[0.5, 0.5]}
      onNodeClick={onNodeClick}
      onNodeContextMenu={onNodeContextMenu}
      onNodeDragStop={(_e, node) => props.onNodeDrag(node.id, node.position)}
      onSelectionDragStop={(_e, dragged) => dragged.forEach(n => props.onNodeDrag(n.id, n.position))}
      onMove={(_e, vp) => props.onZoomChange?.(vp.zoom)}
      minZoom={0.2}
      maxZoom={2}
      defaultViewport={{ x: 40, y: 40, zoom: 0.7 }}
      panOnDrag
      selectionOnDrag={false}
      panOnScroll={false}
      zoomOnScroll
      nodesConnectable={false}
      elementsSelectable
      selectNodesOnDrag={false}
      proOptions={{ hideAttribution: true }}
      deleteKeyCode={null}
      className="bg-slate-50"
    >
      <Background variant={BackgroundVariant.Lines} gap={40} color="#e2e8f0" />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        nodeColor={(n) => (n.type === 'standard' ? '#3b82f6' : n.type === 'argument' ? '#c084fc' : '#6ee7b7')}
        style={{ width: 160, height: 100 }}
      />
    </ReactFlow>
  );
});

/** Provider wrapper so the shell can render <FlowCanvas ref=...> directly. */
export const FlowCanvas = forwardRef<FlowCanvasApi, FlowCanvasProps>(function FlowCanvas(props, ref) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} ref={ref} />
    </ReactFlowProvider>
  );
});

export default FlowCanvas;
