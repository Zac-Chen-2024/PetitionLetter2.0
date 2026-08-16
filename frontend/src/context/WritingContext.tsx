import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react';
import type { WritingEdge, LetterSection, Position, Argument, SubArgument, PipelineState, MergeSuggestion, LegalStandard } from '../types';
import { toProvenanceIndex } from '../types';
import type { WriteV3Result } from '../api';
import { STANDARD_ID_TO_KEY } from '../constants/colors';
import { sectionsFromAPI, sectionTitle, useAnalyzeImpact, useApplyMerges, useConfirmMerges, useExtract, useFetchMergeSuggestions, useGenerateMergeSuggestions, useInvalidate, useSectionsQuery, useWriteSection } from '../api';
import { useProject } from './ProjectContext';

// ============================================
// WritingContext
// Provides: writing canvas state, letter sections, pipeline operations
// ============================================

export interface WritingContextType {
  writingEdges: WritingEdge[];
  setWritingEdges: React.Dispatch<React.SetStateAction<WritingEdge[]>>;
  addWritingEdge: (source: string, target: string, type: WritingEdge['type']) => void;
  removeWritingEdge: (id: string) => void;
  confirmWritingEdge: (id: string) => void;
  letterSections: LetterSection[];
  setLetterSections: React.Dispatch<React.SetStateAction<LetterSection[]>>;
  updateLetterSection: (id: string, content: string) => void;
  writingNodePositions: Map<string, Position>;
  updateWritingNodePosition: (id: string, position: Position) => void;
  // Pipeline operations take projectId & llmProvider as parameters
  generatePetition: (projectId: string, llmProvider: string, setPipelineState: React.Dispatch<React.SetStateAction<PipelineState>>, arguments_?: Argument[], onSubArgSnippetsUpdated?: (updates: Record<string, string[]>) => void, legalStandards?: LegalStandard[]) => Promise<void>;
  reloadSnippets: (projectId: string) => Promise<void>;
  // Unified extraction
  unifiedExtract: (projectId: string, llmProvider: string, applicantName: string, setPipelineState: React.Dispatch<React.SetStateAction<PipelineState>>) => Promise<void>;
  generateMergeSuggestions: (projectId: string, llmProvider: string, applicantName: string) => Promise<MergeSuggestion[]>;
  confirmMerges: (projectId: string, confirmations: Array<{suggestion_id: string; status: string}>) => Promise<void>;
  applyMerges: (projectId: string) => Promise<void>;
  mergeSuggestions: MergeSuggestion[];
  loadMergeSuggestions: (projectId: string) => Promise<void>;
  isExtracting: boolean;
  isMerging: boolean;
  extractionProgress: { current: number; total: number; currentExhibit?: string } | null;
  // Regenerate sub-argument (needs cross-context data)
  regenerateSubArgumentInLetter: (
    subArgumentId: string,
    projectId: string,
    llmProvider: string,
    subArguments: SubArgument[],
    arguments_: Argument[]
  ) => Promise<void>;
  // Remove sub-argument sentences from letter (with cascade)
  removeSubArgumentFromLetter: (
    subArgumentId: string,
    arguments_: Argument[],
    projectId?: string,
    subArgTitle?: string
  ) => void;
  // Mark a section as stale (content out of sync with writing tree)
  markSectionStale: (standardKey: string) => void;
  // Rewrite a single standard's letter section
  rewriteStandard: (standardKey: string, projectId: string, llmProvider: string, onSubArgSnippetsUpdated?: (updates: Record<string, string[]>) => void) => Promise<void>;
  // Exploration writing toggle
  explorationWriting: boolean;
  setExplorationWriting: React.Dispatch<React.SetStateAction<boolean>>;
  // Which standard is currently being rewritten (for UI spinner)
  rewritingStandardKey: string | null;
  // Change cascade: accept/reject/commit
  acceptSuggestion: (sectionId: string, sentenceIndex: number) => void;
  rejectSuggestion: (sectionId: string, sentenceIndex: number) => void;
  commitChanges: (sectionId: string, projectId: string) => Promise<void>;
  dismissChanges: (sectionId: string) => void;
}

const WritingContext = createContext<WritingContextType | undefined>(undefined);

// Initial node positions for writing canvas
const getInitialWritingNodePositions = (): Map<string, Position> => {
  const positions = new Map<string, Position>();
  const connectedSnippetIds = ['snip-1', 'snip-2', 'snip-3', 'snip-4', 'snip-5', 'snip-7', 'snip-9'];
  connectedSnippetIds.forEach((id, index) => {
    positions.set(id, { x: 120, y: 80 + index * 100 });
  });
  const connectedStandardIds = ['std-awards', 'std-contribution', 'std-leading', 'std-salary'];
  connectedStandardIds.forEach((id, index) => {
    positions.set(id, { x: 680, y: 120 + index * 120 });
  });
  return positions;
};

export function WritingProvider({ children }: { children: ReactNode }) {
  const { projectId: currentProjectId } = useProject();
  const invalidate = useInvalidate();
  // mutateAsync references are stable across renders (TanStack Query), so
  // callbacks can depend on them without re-creating on every mutation state change.
  const writeSection = useWriteSection().mutateAsync;
  const analyzeImpact = useAnalyzeImpact().mutateAsync;
  const extract = useExtract().mutateAsync;
  const generateMergeSuggestionsM = useGenerateMergeSuggestions<MergeSuggestion>().mutateAsync;
  const confirmMergesM = useConfirmMerges().mutateAsync;
  const applyMergesM = useApplyMerges().mutateAsync;
  const fetchMergeSuggestions = useFetchMergeSuggestions<MergeSuggestion>();

  const [writingEdges, setWritingEdges] = useState<WritingEdge[]>([]);

  // Letter sections: server snapshot from ['sections', projectId], hydrated
  // ONCE per project. Everything after that (edits, staleness, suggestions,
  // regenerated splices) is local editing state layered on top -- a refetch
  // must not clobber it, so we deliberately do not re-hydrate on invalidation.
  const [letterSections, setLetterSections] = useState<LetterSection[]>([]);
  const sectionsQ = useSectionsQuery(currentProjectId);
  const hydratedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedForRef.current !== currentProjectId) {
      setLetterSections([]);
      hydratedForRef.current = null;
    }
    if (sectionsQ.data && hydratedForRef.current !== currentProjectId) {
      setLetterSections(sectionsFromAPI(sectionsQ.data));
      hydratedForRef.current = currentProjectId;
    }
  }, [currentProjectId, sectionsQ.data]);
  const [writingNodePositions, setWritingNodePositions] = useState<Map<string, Position>>(getInitialWritingNodePositions);

  // Rewriting state — tracks which standard is currently being rewritten
  const [rewritingStandardKey, setRewritingStandardKey] = useState<string | null>(null);

  // Exploration writing toggle (persisted to localStorage)
  const [explorationWriting, setExplorationWriting] = useState<boolean>(() =>
    localStorage.getItem('explorationWriting') === 'true'
  );
  const explorationWritingRef = useRef(explorationWriting);
  useEffect(() => {
    explorationWritingRef.current = explorationWriting;
    localStorage.setItem('explorationWriting', String(explorationWriting));
  }, [explorationWriting]);

  // Unified extraction state
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<{ current: number; total: number; currentExhibit?: string } | null>(null);

  // Writing edge management
  const addWritingEdge = useCallback((source: string, target: string, type: WritingEdge['type']) => {
    setWritingEdges(prev => {
      const exists = prev.some(e => e.source === source && e.target === target);
      if (exists) return prev;

      const newEdge: WritingEdge = {
        id: `we-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        source,
        target,
        type,
        isConfirmed: false,
        createdAt: new Date(),
      };
      return [...prev, newEdge];
    });
  }, []);

  const removeWritingEdge = useCallback((id: string) => {
    setWritingEdges(prev => prev.filter(e => e.id !== id));
  }, []);

  const confirmWritingEdge = useCallback((id: string) => {
    setWritingEdges(prev => prev.map(e =>
      e.id === id ? { ...e, isConfirmed: true } : e
    ));
  }, []);

  // Letter section management
  const updateLetterSection = useCallback((id: string, content: string) => {
    setLetterSections(prev => prev.map(s =>
      s.id === id ? { ...s, content } : s
    ));
  }, []);

  // Writing node position management
  const updateWritingNodePosition = useCallback((id: string, position: Position) => {
    setWritingNodePositions(prev => {
      const newMap = new Map(prev);
      newMap.set(id, position);
      return newMap;
    });
  }, []);

  // Pipeline methods
  const generatePetition = useCallback(async (
    projectId: string,
    llmProvider: string,
    setPipelineState: React.Dispatch<React.SetStateAction<PipelineState>>,
    arguments_?: Argument[],
    onSubArgSnippetsUpdated?: (updates: Record<string, string[]>) => void,
    legalStandards?: LegalStandard[]
  ) => {
    // No arguments → nothing to generate
    if (!arguments_?.length) return;

    // Build order map from legalStandards (dynamic, supports all project types)
    const orderMap = new Map<string, number>();
    legalStandards?.forEach(std => {
      const key = STANDARD_ID_TO_KEY[std.id];
      if (key) orderMap.set(key, std.order);
    });

    // overall_merits is excluded from batch generation — it's manually triggered from canvas
    const standardsToGenerate = [...new Set(
      arguments_.filter(a => a.standardKey && a.standardKey !== 'overall_merits').map(a => a.standardKey!)
    )].sort((a, b) => (orderMap.get(a) ?? 99) - (orderMap.get(b) ?? 99));

    if (standardsToGenerate.length === 0) return;

    const total = standardsToGenerate.length;
    setPipelineState(prev => ({
      ...prev,
      stage: 'generating',
      progress: 0,
      generatingStandard: standardsToGenerate[0],
      generatedCount: 0,
      totalToGenerate: total,
    }));

    // Clear existing sections at start
    setLetterSections([]);

    try {
      for (let i = 0; i < total; i++) {
        const section = standardsToGenerate[i];
        setPipelineState(prev => ({
          ...prev,
          progress: Math.round((i / total) * 100),
          generatingStandard: section,
          generatedCount: i,
        }));

        try {
          const response = await writeSection({
            projectId,
            standardKey: section,
            provider: llmProvider,
            exploration_writing: explorationWritingRef.current,
            job: {
              onSubmitted: (job) => setPipelineState(prev => ({ ...prev, jobId: job.id, jobDetail: job.detail ?? undefined })),
              onProgress: (job) => setPipelineState(prev => ({
                ...prev,
                jobDetail: job.detail ?? undefined,
                // whole-run progress = finished sections + this job's fraction
                progress: Math.round(((i + (job.progress || 0)) / total) * 100),
              })),
            },
          });

          if (response.success && response.paragraph_text) {
            // Notify about new snippet discoveries (exploration mode)
            if (response.updated_subargument_snippets && onSubArgSnippetsUpdated) {
              onSubArgSnippetsUpdated(response.updated_subargument_snippets);
            }
            const newSection: LetterSection = {
              id: `section-${section}`,
              title: sectionTitle(section),
              standardId: section,
              content: response.paragraph_text,
              isGenerated: true,
              order: i,
              sentences: response.sentences,
              provenanceIndex: toProvenanceIndex(response.provenance_index),
            };

            // Incrementally add each section as it's generated
            setLetterSections(prev => [...prev, newSection]);
          }
        } catch (sectionErr) {
          console.log(`Skipped section ${section}:`, sectionErr);
        }
      }

      setPipelineState(prev => ({
        ...prev,
        stage: 'petition_ready',
        progress: 100,
        generatingStandard: undefined,
        generatedCount: total,
        totalToGenerate: total,
        jobId: undefined,
        jobDetail: undefined,
      }));
    } catch (err) {
      setPipelineState(prev => ({
        ...prev,
        stage: 'mapping_confirmed',
        error: err instanceof Error ? err.message : 'Generation failed',
        generatingStandard: undefined,
        jobId: undefined,
        jobDetail: undefined,
      }));
    }
  }, [writeSection]);

  // Mark a section as stale (content out of sync with writing tree changes)
  const markSectionStale = useCallback((standardKey: string) => {
    setLetterSections(prev => prev.map(s =>
      s.standardId === standardKey ? { ...s, isStale: true } : s
    ));
  }, []);

  const rewriteStandard = useCallback(async (
    standardKey: string,
    projectId: string,
    llmProvider: string,
    onSubArgSnippetsUpdated?: (updates: Record<string, string[]>) => void
  ) => {
    console.log('[rewriteStandard] START, setting rewritingStandardKey =', standardKey);
    setRewritingStandardKey(standardKey);
    let response: WriteV3Result;
    try {
      response = await writeSection({
        projectId,
        standardKey,
        provider: llmProvider,
        exploration_writing: explorationWritingRef.current,
      });
    } catch (err) {
      setRewritingStandardKey(null);
      throw err;
    }

    if (response.success && response.paragraph_text) {
      // Notify about new snippet discoveries (exploration mode)
      if (response.updated_subargument_snippets && onSubArgSnippetsUpdated) {
        onSubArgSnippetsUpdated(response.updated_subargument_snippets);
      }

      const newSection: LetterSection = {
        id: `section-${standardKey}`,
        title: sectionTitle(standardKey),
        standardId: standardKey,
        content: response.paragraph_text,
        isGenerated: true,
        order: 0,
        sentences: response.sentences,
        provenanceIndex: toProvenanceIndex(response.provenance_index),
      };

      setLetterSections(prev => {
        const idx = prev.findIndex(s => s.standardId === standardKey);
        if (idx >= 0) {
          // Replace existing section, preserve order
          const updated = [...prev];
          updated[idx] = { ...newSection, order: updated[idx].order };
          return updated;
        }
        // Append if new
        return [...prev, { ...newSection, order: prev.length }];
      });
    }
    console.log('[rewriteStandard] DONE, clearing rewritingStandardKey');
    setRewritingStandardKey(null);
  }, [writeSection]);

  const reloadSnippets = useCallback(async (projectId: string) => {
    await invalidate.snippets(projectId);
  }, [invalidate]);

  // Unified extraction
  const unifiedExtract = useCallback(async (
    projectId: string,
    llmProvider: string,
    applicantName: string,
    setPipelineState: React.Dispatch<React.SetStateAction<PipelineState>>
  ) => {
    setIsExtracting(true);
    setExtractionProgress({ current: 0, total: 0 });
    setPipelineState(prev => ({ ...prev, stage: 'extracting', progress: 0 }));

    try {
      const response = await extract({
        projectId,
        applicant_name: applicantName,
        provider: llmProvider,
        job: {
          onSubmitted: (job) => setPipelineState(prev => ({ ...prev, jobId: job.id, jobDetail: job.detail ?? undefined })),
          onProgress: (job) => {
            setPipelineState(prev => ({ ...prev, jobDetail: job.detail ?? undefined, progress: Math.round((job.progress || 0) * 100) }));
            // "Extracted A1 (3/12)" -> keep the numeric progress the UI already knows how to show
            const m = /\((\d+)\/(\d+)\)/.exec(job.detail || '');
            if (m) setExtractionProgress({ current: Number(m[1]), total: Number(m[2]) });
          },
        },
      });

      if (response.success) {
        setPipelineState(prev => ({
          ...prev,
          stage: 'snippets_ready',
          progress: 100,
          snippetCount: response.total_snippets,
        }));

        // ['snippets'] and ['arguments'] are invalidated by the mutation; the
        // contexts re-hydrate from the refetch.
      } else {
        throw new Error(response.error || 'Extraction failed');
      }
    } catch (err) {
      setPipelineState(prev => ({
        ...prev,
        stage: 'ocr_complete',
        error: err instanceof Error ? err.message : 'Extraction failed',
      }));
      throw err;
    } finally {
      setIsExtracting(false);
      setExtractionProgress(null);
    }
  }, [extract]);

  // Generate merge suggestions
  const generateMergeSuggestions = useCallback(async (
    projectId: string,
    llmProvider: string,
    applicantName: string
  ): Promise<MergeSuggestion[]> => {
    setIsMerging(true);
    try {
      const response = await generateMergeSuggestionsM({ projectId, applicant_name: applicantName, provider: llmProvider });
      if (response.success) {
        setMergeSuggestions(response.suggestions);
        console.log(`Generated ${response.suggestion_count} merge suggestions`);
        return response.suggestions;
      }
      return [];
    } catch (err) {
      console.error('Failed to generate merge suggestions:', err);
      throw err;
    } finally {
      setIsMerging(false);
    }
  }, [generateMergeSuggestionsM]);

  // Load existing merge suggestions
  const loadMergeSuggestions = useCallback(async (projectId: string) => {
    try {
      const response = await fetchMergeSuggestions(projectId);
      setMergeSuggestions(response.suggestions);
    } catch (err) {
      console.error('Failed to load merge suggestions:', err);
    }
  }, [fetchMergeSuggestions]);

  // Confirm/reject merge suggestions
  const confirmMerges = useCallback(async (
    projectId: string,
    confirmations: Array<{suggestion_id: string; status: string}>
  ) => {
    try {
      const response = await confirmMergesM({ projectId, confirmations });
      if (response.success) {
        await loadMergeSuggestions(projectId);
        console.log(`Updated ${response.updated} merge confirmations`);
      }
    } catch (err) {
      console.error('Failed to confirm merges:', err);
      throw err;
    }
  }, [confirmMergesM, loadMergeSuggestions]);

  // Apply confirmed merges
  const applyMerges = useCallback(async (projectId: string) => {
    setIsMerging(true);
    try {
      const response = await applyMergesM({ projectId });
      if (response.success) {
        console.log(`Applied ${response.applied_count} merges, updated ${response.updated_snippets} snippets`);
        setMergeSuggestions([]);
      } else {
        throw new Error(response.error || 'Apply merges failed');
      }
    } catch (err) {
      console.error('Failed to apply merges:', err);
      throw err;
    } finally {
      setIsMerging(false);
    }
  }, [applyMergesM]);

  // Regenerate a specific SubArgument's sentences in the Letter
  const regenerateSubArgumentInLetter = useCallback(async (
    subArgumentId: string,
    projectId: string,
    llmProvider: string,
    subArguments: SubArgument[],
    arguments_: Argument[]
  ) => {
    const subArg = subArguments.find(sa => sa.id === subArgumentId);
    if (!subArg) {
      console.error(`SubArgument ${subArgumentId} not found`);
      return;
    }

    const arg = arguments_.find(a => a.id === subArg.argumentId);
    if (!arg || !arg.standardKey) {
      console.error(`Argument ${subArg.argumentId} not found or has no standardKey`);
      return;
    }

    const standardKey = arg.standardKey;
    const argId = arg.id;

    try {
      const response = await writeSection({
        projectId,
        standardKey,
        provider: llmProvider,
        subargument_ids: [subArgumentId],
      });

      if (!response.success || !response.sentences) {
        console.error('Regeneration failed:', response);
        return;
      }

      const bodySentencesFromAPI = response.sentences.filter(
        s => s.sentence_type === 'body' && s.subargument_id === subArgumentId
      );

      if (bodySentencesFromAPI.length === 0) {
        console.warn('No body sentences returned from API');
        return;
      }

      setLetterSections(prev => prev.map(s => {
        if (s.standardId !== standardKey) return s;

        const indicesToReplace = s.provenanceIndex?.bySubArgument?.[subArgumentId] || [];
        const isNewSubArgument = indicesToReplace.length === 0;

        const oldSentences = [...s.sentences!];
        let newSentences: typeof oldSentences;

        if (isNewSubArgument) {
          const argumentIndices = s.provenanceIndex?.byArgument?.[argId] || [];
          if (argumentIndices.length > 0) {
            const insertAfterIdx = Math.max(...argumentIndices);
            newSentences = [
              ...oldSentences.slice(0, insertAfterIdx + 1),
              ...bodySentencesFromAPI,
              ...oldSentences.slice(insertAfterIdx + 1),
            ];
          } else {
            const closingIdx = oldSentences.findIndex(sent => sent.sentence_type === 'closing');
            if (closingIdx > 0) {
              newSentences = [
                ...oldSentences.slice(0, closingIdx),
                ...bodySentencesFromAPI,
                ...oldSentences.slice(closingIdx),
              ];
            } else {
              newSentences = [...oldSentences, ...bodySentencesFromAPI];
            }
          }
        } else {
          const sortedIndices = [...indicesToReplace].sort((a, b) => a - b);
          const firstIdx = sortedIndices[0];
          const lastIdx = sortedIndices[sortedIndices.length - 1];
          newSentences = [
            ...oldSentences.slice(0, firstIdx),
            ...bodySentencesFromAPI,
            ...oldSentences.slice(lastIdx + 1),
          ];
        }

        const newContent = newSentences.map(sent => sent.text).join(' ');

        const newProvenanceIndex = {
          bySubArgument: {} as Record<string, number[]>,
          byArgument: {} as Record<string, number[]>,
          bySnippet: {} as Record<string, number[]>,
        };

        newSentences.forEach((sent, idx) => {
          if (sent.subargument_id) {
            if (!newProvenanceIndex.bySubArgument[sent.subargument_id]) {
              newProvenanceIndex.bySubArgument[sent.subargument_id] = [];
            }
            newProvenanceIndex.bySubArgument[sent.subargument_id].push(idx);
          }
          if (sent.argument_id) {
            if (!newProvenanceIndex.byArgument[sent.argument_id]) {
              newProvenanceIndex.byArgument[sent.argument_id] = [];
            }
            newProvenanceIndex.byArgument[sent.argument_id].push(idx);
          }
          (sent.snippet_ids || []).forEach(snippetId => {
            if (!newProvenanceIndex.bySnippet[snippetId]) {
              newProvenanceIndex.bySnippet[snippetId] = [];
            }
            newProvenanceIndex.bySnippet[snippetId].push(idx);
          });
        });

        return {
          ...s,
          sentences: newSentences,
          content: newContent,
          provenanceIndex: newProvenanceIndex,
          lastEditedAt: new Date(),
        };
      }));

      console.log(`Successfully regenerated SubArgument ${subArgumentId}`);
    } catch (error) {
      console.error('Failed to regenerate SubArgument:', error);
    }
  }, [writeSection]);

  // Remove sub-argument sentences from letter (with cascade visualization)
  const removeSubArgumentFromLetter = useCallback((
    subArgumentId: string,
    arguments_: Argument[],
    projectId?: string,
    subArgTitle?: string
  ) => {
    // Step 1: Mark sentences as 'removed' (red strikethrough) instead of deleting immediately
    setLetterSections(prev => prev.map(section => {
      const indicesToRemove = section.provenanceIndex?.bySubArgument?.[subArgumentId] || [];
      if (indicesToRemove.length === 0) return section;

      const newSentences = section.sentences?.map((sent, idx) => {
        if (indicesToRemove.includes(idx)) {
          return { ...sent, changeStatus: 'removed' as const };
        }
        return sent;
      }) || [];

      return {
        ...section,
        sentences: newSentences,
        isStale: true,
        lastEditedAt: new Date(),
      };
    }));

    // Step 2: Call LLM impact analysis (async, non-blocking)
    if (projectId) {
      // Find parent standard_key
      const parentArg = arguments_.find(a => a.subArgumentIds?.includes(subArgumentId));
      const standardKey = parentArg?.standardKey;

      if (standardKey) {
        analyzeImpact({
          projectId,
          standard_key: standardKey,
          change_type: 'deletion',
          affected_subargument_id: subArgumentId,
          affected_title: subArgTitle || '',
        }).then(response => {
          if (response.success && response.suggestions.length > 0) {
            setLetterSections(prev => prev.map(section => {
              if (section.standardId !== standardKey) return section;

              const newSentences = section.sentences?.map((sent, idx) => {
                const suggestion = response.suggestions.find(s => s.sentence_index === idx);
                if (suggestion && sent.changeStatus !== 'removed') {
                  return {
                    ...sent,
                    changeStatus: 'needs_adjustment' as const,
                    suggestedText: suggestion.suggested_text,
                    changeReason: suggestion.reason,
                  };
                }
                return sent;
              }) || [];

              return {
                ...section,
                sentences: newSentences,
                pendingSuggestions: response.suggestions.map(s => ({
                  sentenceIndex: s.sentence_index,
                  originalText: s.original_text,
                  suggestedText: s.suggested_text,
                  reason: s.reason,
                })),
              };
            }));
          }
        }).catch(err => {
          console.warn('Impact analysis failed (non-critical):', err);
        });
      }
    }
  }, [analyzeImpact]);

  // Accept a single suggestion
  const acceptSuggestion = useCallback((sectionId: string, sentenceIndex: number) => {
    setLetterSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;

      const newSentences = section.sentences?.map((sent, idx) => {
        if (idx === sentenceIndex && sent.suggestedText) {
          return {
            ...sent,
            text: sent.suggestedText,
            changeStatus: 'suggested_replacement' as const,
            originalText: sent.text,
          };
        }
        return sent;
      }) || [];

      return { ...section, sentences: newSentences };
    }));
  }, []);

  // Reject a single suggestion
  const rejectSuggestion = useCallback((sectionId: string, sentenceIndex: number) => {
    setLetterSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;

      const newSentences = section.sentences?.map((sent, idx) => {
        if (idx === sentenceIndex) {
          return {
            ...sent,
            changeStatus: undefined,
            suggestedText: undefined,
            changeReason: undefined,
          };
        }
        return sent;
      }) || [];

      // Remove from pendingSuggestions
      const newPending = section.pendingSuggestions?.filter(s => s.sentenceIndex !== sentenceIndex);

      return { ...section, sentences: newSentences, pendingSuggestions: newPending };
    }));
  }, []);

  // Commit all changes: apply accepted suggestions, remove 'removed' sentences, rebuild index, save
  const commitChanges = useCallback(async (sectionId: string, projectId: string) => {
    setLetterSections(prev => {
      const updated = prev.map(section => {
        if (section.id !== sectionId) return section;

        // Filter out removed sentences, keep the rest
        const newSentences = (section.sentences || [])
          .filter(sent => sent.changeStatus !== 'removed')
          .map(sent => ({
            ...sent,
            changeStatus: undefined,
            suggestedText: undefined,
            changeReason: undefined,
          }));

        const newContent = newSentences.map(sent => sent.text).join(' ');

        // Rebuild provenance index
        const newProvenanceIndex = {
          bySubArgument: {} as Record<string, number[]>,
          byArgument: {} as Record<string, number[]>,
          bySnippet: {} as Record<string, number[]>,
        };

        newSentences.forEach((sent, idx) => {
          if (sent.subargument_id) {
            if (!newProvenanceIndex.bySubArgument[sent.subargument_id]) {
              newProvenanceIndex.bySubArgument[sent.subargument_id] = [];
            }
            newProvenanceIndex.bySubArgument[sent.subargument_id].push(idx);
          }
          if (sent.argument_id) {
            if (!newProvenanceIndex.byArgument[sent.argument_id]) {
              newProvenanceIndex.byArgument[sent.argument_id] = [];
            }
            newProvenanceIndex.byArgument[sent.argument_id].push(idx);
          }
          (sent.snippet_ids || []).forEach(snippetId => {
            if (!newProvenanceIndex.bySnippet[snippetId]) {
              newProvenanceIndex.bySnippet[snippetId] = [];
            }
            newProvenanceIndex.bySnippet[snippetId].push(idx);
          });
        });

        return {
          ...section,
          sentences: newSentences,
          content: newContent,
          provenanceIndex: newProvenanceIndex,
          isStale: false,
          pendingSuggestions: undefined,
          lastEditedAt: new Date(),
        };
      });

      // Save to backend asynchronously
      const committedSection = updated.find(s => s.id === sectionId);
      if (committedSection?.standardId && projectId) {
        writeSection({
          projectId,
          standardKey: committedSection.standardId,
          provider: 'deepseek',
          additional_instructions: '__commit_only__',
        }).catch(err => {
          console.warn('Failed to persist committed changes:', err);
        });
      }

      return updated;
    });
  }, [writeSection]);

  // Dismiss all changes (revert to clean state without applying)
  const dismissChanges = useCallback((sectionId: string) => {
    setLetterSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;

      // Remove 'removed' sentences and clear all change markers
      const newSentences = (section.sentences || [])
        .filter(sent => sent.changeStatus !== 'removed')
        .map(sent => ({
          ...sent,
          changeStatus: undefined,
          suggestedText: undefined,
          changeReason: undefined,
        }));

      const newContent = newSentences.map(sent => sent.text).join(' ');

      // Rebuild provenance index
      const newProvenanceIndex = {
        bySubArgument: {} as Record<string, number[]>,
        byArgument: {} as Record<string, number[]>,
        bySnippet: {} as Record<string, number[]>,
      };

      newSentences.forEach((sent, idx) => {
        if (sent.subargument_id) {
          if (!newProvenanceIndex.bySubArgument[sent.subargument_id]) {
            newProvenanceIndex.bySubArgument[sent.subargument_id] = [];
          }
          newProvenanceIndex.bySubArgument[sent.subargument_id].push(idx);
        }
        if (sent.argument_id) {
          if (!newProvenanceIndex.byArgument[sent.argument_id]) {
            newProvenanceIndex.byArgument[sent.argument_id] = [];
          }
          newProvenanceIndex.byArgument[sent.argument_id].push(idx);
        }
        (sent.snippet_ids || []).forEach(snippetId => {
          if (!newProvenanceIndex.bySnippet[snippetId]) {
            newProvenanceIndex.bySnippet[snippetId] = [];
          }
          newProvenanceIndex.bySnippet[snippetId].push(idx);
        });
      });

      return {
        ...section,
        sentences: newSentences,
        content: newContent,
        provenanceIndex: newProvenanceIndex,
        isStale: false,
        pendingSuggestions: undefined,
        lastEditedAt: new Date(),
      };
    }));
  }, []);

  const value = useMemo<WritingContextType>(() => ({
    writingEdges,
    setWritingEdges,
    addWritingEdge,
    removeWritingEdge,
    confirmWritingEdge,
    letterSections,
    setLetterSections,
    updateLetterSection,
    writingNodePositions,
    updateWritingNodePosition,
    generatePetition,
    reloadSnippets,
    unifiedExtract,
    generateMergeSuggestions,
    confirmMerges,
    applyMerges,
    mergeSuggestions,
    loadMergeSuggestions,
    isExtracting,
    isMerging,
    extractionProgress,
    explorationWriting,
    setExplorationWriting,
    regenerateSubArgumentInLetter,
    removeSubArgumentFromLetter,
    markSectionStale,
    rewriteStandard,
    rewritingStandardKey,
    acceptSuggestion,
    rejectSuggestion,
    commitChanges,
    dismissChanges,
  }), [writingEdges, letterSections, writingNodePositions, mergeSuggestions, isExtracting, isMerging, extractionProgress, rewritingStandardKey, explorationWriting, addWritingEdge, removeWritingEdge, confirmWritingEdge, updateLetterSection, updateWritingNodePosition, generatePetition, reloadSnippets, unifiedExtract, generateMergeSuggestions, confirmMerges, applyMerges, loadMergeSuggestions, regenerateSubArgumentInLetter, removeSubArgumentFromLetter, markSectionStale, rewriteStandard, acceptSuggestion, rejectSuggestion, commitChanges, dismissChanges]);

  return <WritingContext.Provider value={value}>{children}</WritingContext.Provider>;
}

export function useWriting() {
  const context = useContext(WritingContext);
  if (context === undefined) {
    throw new Error('useWriting must be used within a WritingProvider');
  }
  return context;
}
