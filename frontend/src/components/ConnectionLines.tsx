import { useApp } from '../context/AppContext';
import { getStandardKeyColor } from '../constants/colors';

// Simple curved line helper
function CurvedLine({
  startX, startY, endX, endY, color, strokeWidth = 2.5, glow = false
}: {
  startX: number; startY: number; endX: number; endY: number;
  color: string; strokeWidth?: number; glow?: boolean;
}) {
  const controlOffset = Math.min(60, Math.abs(endX - startX) * 0.35);
  const pathD = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;

  return (
    <g className="transition-all duration-300">
      {glow && (
        <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth + 5} strokeOpacity={0.15} strokeLinecap="round" />
      )}
      <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <circle cx={startX} cy={startY} r={4} fill="white" />
      <circle cx={startX} cy={startY} r={2.5} fill={color} />
      <circle cx={endX} cy={endY} r={4} fill="white" />
      <circle cx={endX} cy={endY} r={2.5} fill={color} />
    </g>
  );
}

// Bounds type for panel visibility checks
interface PanelBounds {
  top: number; bottom: number; left: number; right: number;
}

// Connection lines for a focused snippet (PDF → Card → SubArgument)
function SnippetConnectionLines({ snippetId, snippetBounds }: { snippetId: string; snippetBounds: PanelBounds | null }) {
  const {
    snippetPositions, pdfBboxPositions, allSnippets,
    subArguments, subArgumentPositions
  } = useApp();

  const snippet = allSnippets.find(s => s.id === snippetId);
  const cardPos = snippetPositions.get(snippetId);
  const bboxPos = pdfBboxPositions.get(snippetId);

  if (!snippet) return null;

  // Skip if card is scrolled outside the visible Evidence Cards area
  if (snippetBounds && cardPos && (cardPos.y < snippetBounds.top || cardPos.y > snippetBounds.bottom)) return null;

  const color = snippet.color || '#3b82f6';

  // Calculate card left edge (cardPos.x is right edge)
  const cardLeftX = cardPos ? cardPos.x - (cardPos.width || 0) : 0;
  const cardRightX = cardPos?.x || 0;
  const cardY = cardPos?.y || 0;

  // Find sub-arguments that contain this snippet
  const relatedSubArguments = subArguments.filter(sa => sa.snippetIds?.includes(snippetId));

  return (
    <g>
      {/* 1. PDF bounding box → Evidence Card */}
      {cardPos && bboxPos && (
        <CurvedLine
          startX={bboxPos.x}
          startY={bboxPos.y}
          endX={cardLeftX}
          endY={cardY}
          color={color}
          glow={true}
        />
      )}

      {/* 2. Evidence Card RIGHT side → SubArgument(s) LEFT side */}
      {cardPos && relatedSubArguments.map(subArg => {
        const subArgPos = subArgumentPositions.get(subArg.id);
        if (!subArgPos) return null;
        return (
          <CurvedLine
            key={`snippet-subarg-${subArg.id}`}
            startX={cardRightX}
            startY={cardY}
            endX={subArgPos.x - (subArgPos.width || 0)} // Connect to LEFT side of sub-argument
            endY={subArgPos.y}
            color={color}
            strokeWidth={2}
          />
        );
      })}
    </g>
  );
}

// Connection lines for a focused SubArgument (show Snippet → SubArgument connections)
function SubArgumentConnectionLines({ subArgumentId, snippetBounds }: { subArgumentId: string; snippetBounds: PanelBounds | null }) {
  const {
    allSnippets, snippetPositions,
    arguments: arguments_, subArguments, subArgumentPositions
  } = useApp();

  const subArgument = subArguments.find(sa => sa.id === subArgumentId);
  if (!subArgument) return null;

  const subArgPos = subArgumentPositions.get(subArgumentId);
  if (!subArgPos) return null;

  // Find parent argument to get the color
  const parentArgument = arguments_.find(a => a.id === subArgument.argumentId);
  const standardColor = parentArgument?.standardKey
    ? getStandardKeyColor(parentArgument.standardKey)
    : '#10b981'; // emerald color for sub-arguments

  const subArgLeftX = subArgPos.x - (subArgPos.width || 0);

  return (
    <g>
      {/* Draw connections from snippets to this sub-argument */}
      {(subArgument.snippetIds || []).map(snippetId => {
        const snippet = allSnippets.find(s => s.id === snippetId);
        const cardPos = snippetPositions.get(snippetId);
        if (!snippet || !cardPos) return null;

        // Skip cards scrolled outside the visible Evidence Cards area
        if (snippetBounds && (cardPos.y < snippetBounds.top || cardPos.y > snippetBounds.bottom)) return null;

        return (
          <CurvedLine
            key={`subarg-snip-${snippetId}`}
            startX={cardPos.x} // Right side of snippet card
            startY={cardPos.y}
            endX={subArgLeftX} // Left side of sub-argument
            endY={subArgPos.y}
            color={standardColor}
            strokeWidth={2.5}
            glow={true}
          />
        );
      })}
    </g>
  );
}

export function ConnectionLines() {
  const { focusState, selectedSnippetId, snippetPanelBounds, writingTreePanelBounds } = useApp();

  // No bounds data yet — nothing to render
  if (!snippetPanelBounds && !writingTreePanelBounds) return null;

  // Compute a merged clip rect covering all panels where lines should be visible:
  // From x=0 (includes Document Viewer / PDF Preview) to Writing Tree right edge (excludes Letter Panel).
  // From header bottom to viewport bottom.
  const clipTop = Math.min(snippetPanelBounds?.top ?? Infinity, writingTreePanelBounds?.top ?? Infinity);
  const clipRight = Math.max(snippetPanelBounds?.right ?? 0, writingTreePanelBounds?.right ?? 0);
  const clipBottom = Math.max(snippetPanelBounds?.bottom ?? 0, writingTreePanelBounds?.bottom ?? 0);

  return (
    <svg
      className="fixed inset-0 pointer-events-none z-30"
      width={window.innerWidth}
      height={window.innerHeight}
    >
      <defs>
        <clipPath id="panels-clip">
          <rect x={0} y={clipTop} width={clipRight} height={clipBottom - clipTop} />
        </clipPath>
      </defs>

      <g clipPath="url(#panels-clip)">
        {focusState.type === 'argument' && focusState.id ? (
          <>
            {selectedSnippetId && (
              <SnippetConnectionLines key={`selected-${selectedSnippetId}`} snippetId={selectedSnippetId} snippetBounds={snippetPanelBounds} />
            )}
          </>
        ) : focusState.type === 'subargument' && focusState.id ? (
          <>
            <SubArgumentConnectionLines key={focusState.id} subArgumentId={focusState.id} snippetBounds={snippetPanelBounds} />
            {selectedSnippetId && (
              <SnippetConnectionLines key={`selected-${selectedSnippetId}`} snippetId={selectedSnippetId} snippetBounds={snippetPanelBounds} />
            )}
          </>
        ) : focusState.type === 'standard' && focusState.id ? (
          <>
            {selectedSnippetId && (
              <SnippetConnectionLines key={`selected-${selectedSnippetId}`} snippetId={selectedSnippetId} snippetBounds={snippetPanelBounds} />
            )}
          </>
        ) : selectedSnippetId ? (
          <SnippetConnectionLines key={selectedSnippetId} snippetId={selectedSnippetId} snippetBounds={snippetPanelBounds} />
        ) : null}
      </g>
    </svg>
  );
}
