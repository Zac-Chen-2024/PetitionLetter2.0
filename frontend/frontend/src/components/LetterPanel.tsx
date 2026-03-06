import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import type { LetterSection, SentenceWithProvenance, FocusState } from '../types';

// ============================================
// Section Navigation Component
// ============================================

interface SectionNavProps {
  sections: LetterSection[];
  activeSection: string | null;
  onSectionClick: (sectionId: string) => void;
  generatingStandard?: string;
  rewritingStandard?: string | null;
}

function SectionNav({ sections, activeSection, onSectionClick, generatingStandard, rewritingStandard }: SectionNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Auto-scroll nav to keep active tab visible
  useEffect(() => {
    if (!activeSection) return;
    const tab = tabRefs.current.get(activeSection);
    if (tab && navRef.current) {
      tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeSection]);

  // Auto-scroll to the latest stale section tab
  useEffect(() => {
    const lastStale = [...sections].reverse().find(s => s.isStale);
    if (!lastStale) return;
    const tab = tabRefs.current.get(lastStale.id);
    if (tab && navRef.current) {
      tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [sections, generatingStandard, rewritingStandard]);

  return (
    <div className="flex-shrink-0 bg-white shadow-md relative z-10">
      <div ref={navRef} className="flex overflow-x-auto scrollbar-hide">
        {sections.map((section, idx) => {
          const isActive = activeSection === section.id;
          const isStale = section.isStale && generatingStandard !== section.standardId && rewritingStandard !== section.standardId;
          return (
            <button
              key={section.id}
              ref={(el) => { if (el) tabRefs.current.set(section.id, el); }}
              onClick={() => onSectionClick(section.id)}
              className={`relative px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-all
                ${isActive
                  ? 'text-blue-600'
                  : isStale
                    ? 'text-amber-700'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
            >
              <span className="flex items-center gap-1.5">
                {(generatingStandard === section.standardId || rewritingStandard === section.standardId) ? (
                  <svg className="animate-spin w-4 h-4 text-blue-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold
                    ${isActive
                      ? 'bg-blue-600 text-white'
                      : isStale
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-200 text-slate-500'}`}>
                    {idx + 1}
                  </span>
                )}
                {section.title}
                {isStale && (
                  <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0 animate-stale-glow" title="Content out of date" />
                )}
              </span>
              {/* Active indicator line */}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Provenance Tooltip Component
// ============================================

interface ProvenanceTooltipProps {
  sentence: SentenceWithProvenance;
  position: { x: number; y: number };
  onClose: () => void;
}

function ProvenanceTooltip({ sentence, position, onClose }: ProvenanceTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const sentenceTypeLabel = {
    'opening': 'Opening Statement',
    'body': 'Supporting Evidence',
    'closing': 'Conclusion'
  }[sentence.sentence_type || 'body'];

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-3 max-w-sm"
      style={{
        left: Math.min(position.x, window.innerWidth - 320),
        top: position.y + 10,
      }}
    >
      <div className="text-xs space-y-2">
        {/* Sentence Type */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Type:</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            sentence.sentence_type === 'opening' ? 'bg-purple-100 text-purple-700' :
            sentence.sentence_type === 'closing' ? 'bg-green-100 text-green-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {sentenceTypeLabel}
          </span>
        </div>

        {/* SubArgument */}
        {sentence.subargument_id && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">SubArgument:</span>
            <span className="text-slate-700 font-mono text-[10px]">
              {sentence.subargument_id}
            </span>
          </div>
        )}

        {/* Argument */}
        {sentence.argument_id && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Argument:</span>
            <span className="text-slate-700 font-mono text-[10px]">
              {sentence.argument_id}
            </span>
          </div>
        )}

        {/* Exhibit References */}
        {sentence.exhibit_refs && sentence.exhibit_refs.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-slate-500">Exhibits:</span>
            <div className="flex flex-wrap gap-1">
              {sentence.exhibit_refs.map((ref, idx) => (
                <span key={idx} className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">
                  {ref}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Snippet Count */}
        {sentence.snippet_ids && sentence.snippet_ids.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Sources:</span>
            <span className="text-slate-700">
              {sentence.snippet_ids.length} snippet{sentence.snippet_ids.length > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Edit Status */}
        {sentence.isEdited && (
          <div className="flex items-center gap-2 text-orange-600">
            <span>✏️ Edited</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Letter Section Component
// ============================================

interface LetterSectionComponentProps {
  section: LetterSection;
  isHighlighted: boolean;
  onHover: (standardId?: string) => void;
  onEdit: (id: string, content: string) => void;
  onRewrite?: (standardId: string) => void;
  isRewriting?: boolean;
  onSentenceClick?: (sentence: SentenceWithProvenance, idx: number) => void;
  onExhibitClick?: (exhibitId: string, page?: number, subargumentId?: string | null, snippetIds?: string[], sectionId?: string, sentenceIdx?: number) => void;
  focusedSubArgumentId?: string | null;
  focusedArgumentId?: string | null;
  exhibitFocusedKey?: string | null;
  paragraphRefs?: React.MutableRefObject<Map<string, HTMLParagraphElement>>;
}

function LetterSectionComponent({
  section,
  isHighlighted,
  onHover,
  onEdit,
  onRewrite,
  isRewriting,
  onSentenceClick,
  onExhibitClick,
  focusedSubArgumentId,
  focusedArgumentId,
  exhibitFocusedKey,
  paragraphRefs
}: LetterSectionComponentProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(section.content);
  const [hoveredSentenceIdx, setHoveredSentenceIdx] = useState<number | null>(null);
  const [tooltipSentence, setTooltipSentence] = useState<{
    sentence: SentenceWithProvenance;
    position: { x: number; y: number };
  } | null>(null);

  // Render text with clickable exhibit refs (blue, clickable)
  // Each exhibit ref inside [...] is independently clickable and points to its own snippet
  const renderTextWithExhibitRefs = useCallback((text: string, sentence: SentenceWithProvenance, sentenceIdx: number) => {
    // Match the entire bracket: [Exhibit A1, p.2] or [Exhibit A1, p.2; Exhibit B3, p.4; ...]
    const bracketPattern = /\[([^\]]*Exhibit\s+[A-Z0-9-][^\]]*)\]/gi;
    // Individual exhibit within a bracket
    const singlePattern = /Exhibit\s+([A-Z0-9-]+)(?:,\s*p\.?(\d+))?/gi;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let keyIdx = 0;

    while ((match = bracketPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      // Parse all individual exhibits inside this bracket
      const inner = match[1];
      const exhibits: { id: string; page?: number; text: string }[] = [];
      let sm;
      singlePattern.lastIndex = 0;
      while ((sm = singlePattern.exec(inner)) !== null) {
        exhibits.push({
          id: sm[1],
          page: sm[2] ? parseInt(sm[2]) : undefined,
          text: sm[0],
        });
      }

      parts.push(<span key={`br-${keyIdx++}`}>[</span>);
      exhibits.forEach((ex, i) => {
        if (i > 0) parts.push(<span key={`sep-${keyIdx++}`}>; </span>);
        parts.push(
          <span
            key={`ex-${keyIdx++}`}
            onClick={(e) => {
              e.stopPropagation();
              onExhibitClick?.(ex.id, ex.page, sentence.subargument_id, sentence.snippet_ids, section.id, sentenceIdx);
            }}
            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium"
            title={`Click to view Exhibit ${ex.id}${ex.page ? `, page ${ex.page}` : ''}`}
          >
            {ex.text}
          </span>
        );
      });
      parts.push(<span key={`br-${keyIdx++}`}>]</span>);

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  }, [onExhibitClick]);

  const handleSave = () => {
    onEdit(section.id, editContent);
    setIsEditing(false);
  };

  // Handle right-click for provenance tooltip
  const handleContextMenu = useCallback((
    e: React.MouseEvent,
    sentence: SentenceWithProvenance
  ) => {
    e.preventDefault();
    setTooltipSentence({
      sentence,
      position: { x: e.clientX, y: e.clientY }
    });
  }, []);

  // Check if a sentence is highlighted based on focus state
  const isSentenceFocused = useCallback((sentence: SentenceWithProvenance, idx: number): boolean => {
    // Exhibit-level focus: only highlight the exact sentence
    if (exhibitFocusedKey === `${section.id}:${idx}`) {
      return true;
    }
    // If exhibit focus is active but not this sentence, skip subargument-level highlight
    if (exhibitFocusedKey) {
      return false;
    }
    if (focusedSubArgumentId && sentence.subargument_id === focusedSubArgumentId) {
      return true;
    }
    if (focusedArgumentId && sentence.argument_id === focusedArgumentId) {
      return true;
    }
    return false;
  }, [focusedSubArgumentId, focusedArgumentId, exhibitFocusedKey, section.id]);

  // No special styling for sentence types to avoid layout shifts

  // Render content with sentence-level provenance highlighting
  const renderContent = () => {
    if (!section.sentences || section.sentences.length === 0) {
      // No sentence-level provenance - just render plain text
      return (
        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
          {section.content}
        </p>
      );
    }

    // Group sentences by SubArgument for paragraph breaks
    const renderSentence = (sentence: SentenceWithProvenance, idx: number) => {
      const hasProvenance = sentence.snippet_ids && sentence.snippet_ids.length > 0;
      const hasSubArgument = !!sentence.subargument_id;
      const isClickable = hasProvenance || hasSubArgument;
      const isHovered = hoveredSentenceIdx === idx;
      const isFocused = isSentenceFocused(sentence, idx);

      return (
        <span
          key={idx}
          onClick={() => isClickable && onSentenceClick?.(sentence, idx)}
          onContextMenu={(e) => handleContextMenu(e, sentence)}
          onMouseEnter={() => setHoveredSentenceIdx(idx)}
          onMouseLeave={() => setHoveredSentenceIdx(null)}
          className={`
            ${isClickable ? 'cursor-pointer' : ''}
            ${isHovered && isClickable ? 'bg-blue-100 rounded' : ''}
            ${isFocused ? 'bg-yellow-200 rounded font-medium' : ''}
            ${sentence.isEdited ? 'border-b border-dashed border-orange-300' : ''}
            transition-colors inline
          `}
          title={isClickable ? 'Click to focus source • Right-click for details' : undefined}
        >
          {renderTextWithExhibitRefs(sentence.text, sentence, idx)}
          {/* Provenance indicators */}
          {(hasProvenance || hasSubArgument) && (
            <sup className="text-[10px] ml-0.5 select-none">
              {hasSubArgument && (
                <span className="text-purple-500">◆</span>
              )}
              {hasProvenance && (
                <span className="text-blue-500">[{sentence.snippet_ids.length}]</span>
              )}
            </sup>
          )}
          {' '}
        </span>
      );
    };

    // Group sentences into paragraphs by SubArgument
    const paragraphs: { key: string; sentences: { sentence: SentenceWithProvenance; idx: number }[] }[] = [];
    let currentParagraph: { key: string; sentences: { sentence: SentenceWithProvenance; idx: number }[] } | null = null;

    section.sentences.forEach((sentence, idx) => {
      const paragraphKey = sentence.sentence_type === 'opening' ? '__opening__'
        : sentence.sentence_type === 'closing' ? '__closing__'
        : sentence.subargument_id || '__body__';

      if (!currentParagraph || currentParagraph.key !== paragraphKey) {
        currentParagraph = { key: paragraphKey, sentences: [] };
        paragraphs.push(currentParagraph);
      }
      currentParagraph.sentences.push({ sentence, idx });
    });

    return (
      <div className="text-sm text-slate-600 leading-relaxed space-y-3">
        {paragraphs.map((para, pIdx) => {
          // Store ref for SubArgument paragraphs (skip __opening__, __closing__, __body__)
          const isSubArgParagraph = para.key && !para.key.startsWith('__');
          const setParaRef = (el: HTMLParagraphElement | null) => {
            if (el && isSubArgParagraph && paragraphRefs) {
              paragraphRefs.current.set(para.key, el);
            }
          };
          return (
            <p
              key={pIdx}
              ref={setParaRef}
              data-subargument-id={isSubArgParagraph ? para.key : undefined}
              className="text-justify"
            >
              {para.sentences.map(({ sentence, idx }) => renderSentence(sentence, idx))}
            </p>
          );
        })}

        {/* Provenance Tooltip */}
        {tooltipSentence && (
          <ProvenanceTooltip
            sentence={tooltipSentence.sentence}
            position={tooltipSentence.position}
            onClose={() => setTooltipSentence(null)}
          />
        )}
      </div>
    );
  };

  return (
    <div
      className={`
        p-4 border-b border-slate-200
        ${isHighlighted ? 'bg-blue-50' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-800">{section.title}</h3>
        <div className="flex items-center gap-2">
          {section.isEdited && (
            <span className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
              edited
            </span>
          )}
          {/* Regenerate button — always visible, highlighted + pulsing when stale */}
          {section.standardId && onRewrite && (
            <button
              onClick={() => onRewrite(section.standardId!)}
              disabled={isRewriting}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs transition-colors ${
                isRewriting
                  ? 'text-slate-400 cursor-not-allowed'
                  : section.isStale
                    ? 'text-amber-700 bg-amber-100 hover:bg-amber-200 font-medium animate-stale-glow'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
              title={section.isStale ? 'Content out of date — click to regenerate' : 'Rewrite this section'}
            >
              {isRewriting ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              <span>{section.isStale ? 'Regenerate' : 'Rewrite'}</span>
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-32 text-sm text-slate-700 border border-slate-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {t('common.save')}
            </button>
            <button
              onClick={() => {
                setEditContent(section.content);
                setIsEditing(false);
              }}
              className="text-xs px-3 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        renderContent()
      )}
    </div>
  );
}

// ============================================
// Letter Panel Component
// ============================================

interface LetterPanelProps {
  className?: string;
}

export function LetterPanel({ className = '' }: LetterPanelProps) {
  const { t } = useTranslation();
  const {
    letterSections,
    updateLetterSection,
    focusState,
    setFocusState,
    setSelectedDocumentId,
    allSnippets,
    setSelectedSnippetId,
    generatePetition,
    pipelineState,
    rewriteStandard,
    rewritingStandardKey,
    explorationWriting,
    setExplorationWriting,
  } = useApp();

  const [hoveredStandardId, setHoveredStandardId] = useState<string | undefined>(undefined);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [exhibitFocusedKey, setExhibitFocusedKey] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const paragraphRefs = useRef<Map<string, HTMLParagraphElement>>(new Map());

  // Scroll to section when clicking navigation
  const scrollToSection = useCallback((sectionId: string) => {
    const element = sectionRefs.current.get(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(sectionId);
    }
  }, []);

  // Track active section on scroll — pick the section closest to the top of the container
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let closest: { id: string; distance: number } | null = null;

      sectionRefs.current.forEach((element, sectionId) => {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - containerTop);
        if (!closest || distance < closest.distance) {
          closest = { id: sectionId, distance };
        }
      });

      if (closest) {
        setActiveSection(closest.id);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [letterSections]);

  // Initialize active section
  useEffect(() => {
    if (letterSections.length > 0 && !activeSection) {
      setActiveSection(letterSections[0].id);
    }
  }, [letterSections, activeSection]);

  // Extract focused IDs from global focus state
  const focusedSubArgumentId = useMemo(() => {
    return focusState.type === 'subargument' ? focusState.id : null;
  }, [focusState]);

  const focusedArgumentId = useMemo(() => {
    return focusState.type === 'argument' ? focusState.id : null;
  }, [focusState]);

  // Auto-scroll to paragraph when SubArgument is focused
  useEffect(() => {
    if (focusedSubArgumentId) {
      const paragraphEl = paragraphRefs.current.get(focusedSubArgumentId);
      if (paragraphEl && contentRef.current) {
        // Scroll the paragraph into view within the content container
        paragraphEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [focusedSubArgumentId]);

  // Handle rewrite for a single section
  // rewritingStandardKey is managed by WritingContext automatically
  const handleRewrite = useCallback(async (standardId: string) => {
    try {
      await rewriteStandard(standardId);
    } catch (err) {
      console.error('Rewrite failed:', err);
    }
  }, [rewriteStandard]);

  // Handle sentence click - set focus to SubArgument or Argument
  const handleSentenceClick = useCallback((sentence: SentenceWithProvenance, _idx: number) => {
    // Clear exhibit-level highlight, fall back to subargument-level
    setExhibitFocusedKey(null);
    // Prefer SubArgument focus, fallback to Argument
    if (sentence.subargument_id) {
      setFocusState({
        type: 'subargument',
        id: sentence.subargument_id
      });
    } else if (sentence.argument_id) {
      setFocusState({
        type: 'argument',
        id: sentence.argument_id
      });
    } else if (sentence.snippet_ids && sentence.snippet_ids.length > 0) {
      // Fallback to snippet focus
      setFocusState({
        type: 'snippet',
        id: sentence.snippet_ids[0]
      });
    }
  }, [setFocusState]);

  // Handle exhibit click - highlight only the clicked sentence, then navigate to document
  const handleExhibitClick = useCallback((
    exhibitId: string,
    page?: number,
    subargumentId?: string | null,
    sentenceSnippetIds?: string[],
    sectionId?: string,
    sentenceIdx?: number
  ) => {
    // 1. Set exhibit-level focus to highlight only this sentence (not entire subargument)
    if (sectionId != null && sentenceIdx != null) {
      setExhibitFocusedKey(`${sectionId}:${sentenceIdx}`);
    }

    // 2. Focus SubArgument so snippet panel shows connection lines
    if (subargumentId) {
      setFocusState({
        type: 'subargument',
        id: subargumentId
      });
    }

    // 3. Set the document to view
    const docId = `doc_${exhibitId}`;
    setSelectedDocumentId(docId);

    // 3. Find the snippet that matches exhibit + page from sentence's snippet_ids
    let matchingSnippet = null;

    if (sentenceSnippetIds && sentenceSnippetIds.length > 0) {
      // First try: find snippet from sentence that matches exhibit and page
      matchingSnippet = allSnippets.find(s =>
        sentenceSnippetIds.includes(s.id) &&
        s.exhibitId === exhibitId &&
        (!page || s.page === page)
      );

      // Second try: just use the first snippet from the sentence
      if (!matchingSnippet) {
        matchingSnippet = allSnippets.find(s => sentenceSnippetIds.includes(s.id));
      }
    }

    // Fallback: find any snippet from this exhibit
    if (!matchingSnippet) {
      matchingSnippet = allSnippets.find(s =>
        s.exhibitId === exhibitId && (!page || s.page === page)
      );
    }

    if (matchingSnippet) {
      setSelectedSnippetId(matchingSnippet.id);
    }
  }, [setSelectedDocumentId, allSnippets, setSelectedSnippetId, setFocusState]);

  // Stats for footer
  const stats = useMemo(() => {
    let totalSentences = 0;
    let tracedSentences = 0;
    let editedSentences = 0;

    letterSections.forEach(section => {
      if (section.sentences) {
        // Exclude opening/closing boilerplate from trace stats
        const contentSentences = section.sentences.filter(s =>
          s.sentence_type !== 'opening' && s.sentence_type !== 'closing'
        );
        totalSentences += contentSentences.length;
        tracedSentences += contentSentences.filter(s =>
          s.snippet_ids?.length > 0 || s.subargument_id
        ).length;
        editedSentences += section.sentences.filter(s => s.isEdited).length;
      }
    });

    return { totalSentences, tracedSentences, editedSentences };
  }, [letterSections]);

  return (
    <div className={`flex flex-col bg-white ${className}`}>
      {/* Letter Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">{t('writing.petitionLetter')}</h2>
              <p className="text-xs text-slate-500">
                {letterSections.filter(s => s.isGenerated).length}/{letterSections.length} sections
              </p>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <div className={`relative w-7 h-4 rounded-full transition-colors ${
                explorationWriting ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
                onClick={() => setExplorationWriting(p => !p)}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                  explorationWriting ? 'translate-x-3.5' : 'translate-x-0.5'
                }`} />
              </div>
              <span className={`text-[11px] font-medium ${
                explorationWriting ? 'text-emerald-700' : 'text-slate-400'
              }`}>Exploration</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generatePetition}
              disabled={pipelineState.stage === 'generating'}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                pipelineState.stage === 'generating'
                  ? 'bg-blue-100 text-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {pipelineState.stage === 'generating' ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>
                    {pipelineState.generatedCount != null && pipelineState.totalToGenerate
                      ? `${pipelineState.generatedCount + 1}/${pipelineState.totalToGenerate}`
                      : `${pipelineState.progress}%`}
                    {pipelineState.generatingStandard && (
                      <span className="ml-1 text-blue-500">
                        {pipelineState.generatingStandard.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Generate All</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Section Navigation */}
      <SectionNav
        sections={letterSections}
        activeSection={activeSection}
        onSectionClick={scrollToSection}
        generatingStandard={pipelineState.stage === 'generating' ? pipelineState.generatingStandard : undefined}
        rewritingStandard={rewritingStandardKey}
      />

      {/* Letter Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        {letterSections.length === 0 && pipelineState.stage === 'generating' ? (
          /* Empty state during generation — show progress */
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-medium text-slate-600">
                Generating section {(pipelineState.generatedCount ?? 0) + 1} of {pipelineState.totalToGenerate ?? '?'}
              </p>
              {pipelineState.generatingStandard && (
                <p className="text-xs text-slate-400 mt-1">
                  {pipelineState.generatingStandard.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {letterSections.map(section => {
              // Create a callback ref to store in the Map
              const setRef = (el: HTMLDivElement | null) => {
                if (el) {
                  sectionRefs.current.set(section.id, el);
                }
              };
              return (
                <div key={section.id} ref={setRef} data-section-id={section.id}>
                  <LetterSectionComponent
                    section={section}
                    isHighlighted={section.standardId === hoveredStandardId ||
                      (focusState.type === 'standard' && section.standardId === focusState.id)}
                    onHover={setHoveredStandardId}
                    onEdit={updateLetterSection}
                    onRewrite={handleRewrite}
                    isRewriting={rewritingStandardKey === section.standardId}
                    onSentenceClick={handleSentenceClick}
                    onExhibitClick={handleExhibitClick}
                    focusedSubArgumentId={focusedSubArgumentId}
                    focusedArgumentId={focusedArgumentId}
                    exhibitFocusedKey={exhibitFocusedKey}
                    paragraphRefs={paragraphRefs}
                  />
                </div>
              );
            })}
            {/* Show generating indicator at the bottom when sections are being added incrementally */}
            {pipelineState.stage === 'generating' && pipelineState.generatingStandard && (
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-center gap-2 text-slate-400">
                  <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-xs">
                    Generating: {pipelineState.generatingStandard.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}...
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Letter Footer with V3 Stats */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{t('writing.sections', { count: letterSections.length })}</span>
          <div className="flex items-center gap-3">
            <span title="Sentences with provenance tracking">
              📍 {stats.tracedSentences}/{stats.totalSentences} traced
            </span>
            {stats.editedSentences > 0 && (
              <span title="Manually edited sentences" className="text-orange-500">
                ✏️ {stats.editedSentences} edited
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
