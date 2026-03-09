/**
 * AppContext.tsx - Backward-compatible facade
 *
 * This file re-exports the useApp() hook that combines all 5 decomposed contexts.
 * Existing components can continue to import { useApp } from './context/AppContext'
 * without any changes.
 *
 * The actual state is managed by:
 *   - ProjectContext  (project identity, loading, LLM provider)
 *   - SnippetsContext  (raw snippets, connections, selection)
 *   - ArgumentsContext (arguments, sub-arguments, generation)
 *   - UIContext        (focus, positions, view modes, drag state)
 *   - WritingContext   (writing edges, letter sections, pipeline)
 */

import { useCallback, useMemo } from 'react';
import type { SubArgument, MergeSuggestion } from '../types';
import { useProject } from './ProjectContext';
import { useSnippets } from './SnippetsContext';
import { useArguments } from './ArgumentsContext';
import { useUI } from './UIContext';
import { useWriting } from './WritingContext';
import { AppProviders } from './ContextProviders';

// Re-export types that were previously exported from this file
// Now defined in ../types/index.ts
export type { PipelineStage, PipelineState, MergeSuggestion } from '../types';

// Re-export the AppProviders as AppProvider for backward compatibility
export const AppProvider = AppProviders;

// Re-export individual hooks for gradual migration
export { useProject } from './ProjectContext';
export { useSnippets } from './SnippetsContext';
export { useArguments } from './ArgumentsContext';
export { useUI } from './UIContext';
export { useWriting } from './WritingContext';

/**
 * useApp() - backward-compatible facade hook
 *
 * Combines all 5 contexts into a single object matching the original AppContextType.
 * Existing components don't need to change their imports.
 */
export function useApp() {
  const project = useProject();
  const snippets = useSnippets();
  const args = useArguments();
  const ui = useUI();
  const writing = useWriting();

  // Bind cross-context functions that need projectId / llmProvider / other context data

  // generateArguments: original signature is (forceReanalyze?, applicantName?) => Promise<void>
  // ArgumentsContext signature is (projectId, llmProvider, forceReanalyze?, applicantName?) => Promise<void>
  const generateArguments = useCallback(async (forceReanalyze?: boolean, applicantName?: string) => {
    return args.generateArguments(project.projectId, project.llmProvider, forceReanalyze, applicantName);
  }, [args.generateArguments, project.projectId, project.llmProvider]);

  // addSubArgument: original signature takes data, returns Promise<SubArgument>
  // ArgumentsContext signature takes (data, projectId) => Promise<SubArgument>
  // After adding, mark the parent standard's letter section as stale
  const addSubArgument = useCallback(async (
    subArgumentData: Omit<SubArgument, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<SubArgument> => {
    const result = await args.addSubArgument(subArgumentData, project.projectId);
    // Mark parent argument's standard section as stale
    const parentArg = args.arguments.find(a => a.id === subArgumentData.argumentId);
    if (parentArg?.standardKey) {
      writing.markSectionStale(parentArg.standardKey);
    }
    return result;
  }, [args.addSubArgument, args.arguments, writing.markSectionStale, project.projectId]);

  // removeSubArgument: delete sub-argument then mark section as stale
  const removeSubArgument = useCallback(async (id: string) => {
    const subArg = args.subArguments.find(sa => sa.id === id);
    const parentArg = args.arguments.find(a => a.id === subArg?.argumentId);
    const standardKey = parentArg?.standardKey;

    // Delete the sub-argument (backend + frontend state)
    args.removeSubArgument(id, project.projectId);

    // Mark section as stale (user manually clicks Regenerate)
    if (standardKey) {
      writing.markSectionStale(standardKey);
    }
  }, [args.removeSubArgument, args.arguments, args.subArguments, writing.markSectionStale, project.projectId]);

  // Change cascade: bind projectId for commitChanges
  const commitChanges = useCallback(async (sectionId: string) => {
    return writing.commitChanges(sectionId, project.projectId);
  }, [writing.commitChanges, project.projectId]);

  // regenerateSubArgument: original signature takes (subArgumentId) => Promise<void>
  const regenerateSubArgument = useCallback(async (subArgumentId: string) => {
    return writing.regenerateSubArgumentInLetter(subArgumentId, project.projectId, project.llmProvider, args.subArguments, args.arguments);
  }, [writing.regenerateSubArgumentInLetter, project.projectId, project.llmProvider, args.subArguments, args.arguments]);

  // mergeSubArguments: facade binds projectId
  // Moves sub-args under a new Argument (regroup, no deletion)
  // After merge, mark the new argument's standard section as stale
  const mergeSubArguments = useCallback(async (
    subArgumentIds: string[],
    title: string,
    purpose: string,
    relationship: string
  ) => {
    // Collect source standardKeys before merge (sub-args may come from different arguments)
    const sourceStandardKeys = new Set<string>();
    for (const saId of subArgumentIds) {
      const sa = args.subArguments.find(s => s.id === saId);
      const parentArg = args.arguments.find(a => a.id === sa?.argumentId);
      if (parentArg?.standardKey) sourceStandardKeys.add(parentArg.standardKey);
    }

    const result = await args.mergeSubArguments(subArgumentIds, title, purpose, relationship, project.projectId);

    // Mark the new argument's standard as stale
    if (result.newArgument.standardKey) {
      writing.markSectionStale(result.newArgument.standardKey);
    }
    // Also mark any source standards that differ from the target
    for (const key of sourceStandardKeys) {
      if (key !== result.newArgument.standardKey) {
        writing.markSectionStale(key);
      }
    }

    return result;
  }, [args.mergeSubArguments, args.subArguments, args.arguments, writing.markSectionStale, project.projectId]);

  // moveSubArguments: facade binds projectId
  // After move, mark both source and target standard sections as stale
  const moveSubArguments = useCallback(async (
    subArgumentIds: string[],
    targetArgumentId: string
  ) => {
    // Collect source standardKeys before move
    const sourceStandardKeys = new Set<string>();
    for (const saId of subArgumentIds) {
      const sa = args.subArguments.find(s => s.id === saId);
      const parentArg = args.arguments.find(a => a.id === sa?.argumentId);
      if (parentArg?.standardKey) sourceStandardKeys.add(parentArg.standardKey);
    }

    await args.moveSubArguments(subArgumentIds, targetArgumentId, project.projectId);

    // Mark target standard as stale
    const targetArg = args.arguments.find(a => a.id === targetArgumentId);
    if (targetArg?.standardKey) {
      writing.markSectionStale(targetArg.standardKey);
    }
    // Mark source standards as stale
    for (const key of sourceStandardKeys) {
      writing.markSectionStale(key);
    }
  }, [args.moveSubArguments, args.subArguments, args.arguments, writing.markSectionStale, project.projectId]);

  // consolidateSubArguments: facade binds projectId + llmProvider
  // Fuses multiple sub-args into one new SubArgument under target Argument
  const consolidateSubArguments = useCallback(async (
    subArgumentIds: string[],
    targetArgumentId: string
  ) => {
    // Collect source standardKeys before consolidation
    const sourceStandardKeys = new Set<string>();
    for (const saId of subArgumentIds) {
      const sa = args.subArguments.find(s => s.id === saId);
      const parentArg = args.arguments.find(a => a.id === sa?.argumentId);
      if (parentArg?.standardKey) sourceStandardKeys.add(parentArg.standardKey);
    }

    const result = await args.consolidateSubArguments(subArgumentIds, targetArgumentId, project.projectId, project.llmProvider);

    // Mark target standard as stale
    const targetArg = args.arguments.find(a => a.id === targetArgumentId);
    if (targetArg?.standardKey) {
      writing.markSectionStale(targetArg.standardKey);
    }
    // Mark source standards as stale
    for (const key of sourceStandardKeys) {
      writing.markSectionStale(key);
    }

    return result;
  }, [args.consolidateSubArguments, args.subArguments, args.arguments, writing.markSectionStale, project.projectId, project.llmProvider]);

  // createArgument: facade binds projectId
  const createArgument = useCallback(async (standardKey: string) => {
    return args.createArgument(standardKey, project.projectId);
  }, [args.createArgument, project.projectId]);

  // moveToOverallMerits: facade binds projectId
  const moveToOverallMerits = useCallback(async (
    level: 'standard' | 'argument' | 'subargument',
    targetId: string
  ) => {
    return args.moveToOverallMerits(level, targetId, project.projectId);
  }, [args.moveToOverallMerits, project.projectId]);

  // Exploration writing: sync new snippet_ids discovered during writing back to subarguments
  const handleSubArgSnippetsUpdated = useCallback((updates: Record<string, string[]>) => {
    for (const [subArgId, snippetIds] of Object.entries(updates)) {
      args.updateSubArgument(subArgId, { snippetIds });
    }
  }, [args.updateSubArgument]);

  // rewriteStandard: re-generate letter section for a single standard
  const rewriteStandard = useCallback(async (standardKey: string) => {
    return writing.rewriteStandard(standardKey, project.projectId, project.llmProvider, handleSubArgSnippetsUpdated);
  }, [writing.rewriteStandard, project.projectId, project.llmProvider, handleSubArgSnippetsUpdated]);

  // removeStandard: delete all arguments/sub-args under a standard + remove letter section
  const removeStandard = useCallback(async (standardKey: string) => {
    await args.removeStandard(standardKey, project.projectId);
    writing.setLetterSections(prev => prev.filter(s => s.standardId !== standardKey));
  }, [args.removeStandard, project.projectId, writing.setLetterSections]);

  // removeArgument: original removes from arguments + writingEdges + argumentMappings
  // ArgumentsContext only removes from arguments + argumentMappings
  // We also need to remove from writingEdges
  const removeArgument = useCallback((id: string) => {
    args.removeArgument(id);
    // Also remove writing edges connected to this argument
    writing.setWritingEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
  }, [args.removeArgument, writing.setWritingEdges]);

  // Pipeline operations: bind projectId and setters
  const extractSnippets = useCallback(async () => {
    return writing.extractSnippets(project.projectId, snippets.setSnippets, project.setPipelineState);
  }, [writing.extractSnippets, project.projectId, snippets.setSnippets, project.setPipelineState]);

  const confirmAllMappings = useCallback(async () => {
    return writing.confirmAllMappings(project.projectId, project.setPipelineState);
  }, [writing.confirmAllMappings, project.projectId, project.setPipelineState]);

  const generatePetition = useCallback(async () => {
    return writing.generatePetition(project.projectId, project.llmProvider, project.setPipelineState, args.arguments, handleSubArgSnippetsUpdated, project.legalStandards);
  }, [writing.generatePetition, project.projectId, project.llmProvider, project.setPipelineState, args.arguments, handleSubArgSnippetsUpdated, project.legalStandards]);

  const reloadSnippets = useCallback(async () => {
    return writing.reloadSnippets(project.projectId, snippets.setSnippets);
  }, [writing.reloadSnippets, project.projectId, snippets.setSnippets]);

  // Unified extraction operations: bind projectId, llmProvider, and setters
  const unifiedExtract = useCallback(async (applicantName: string) => {
    return writing.unifiedExtract(project.projectId, project.llmProvider, applicantName, snippets.setSnippets, project.setPipelineState);
  }, [writing.unifiedExtract, project.projectId, project.llmProvider, snippets.setSnippets, project.setPipelineState]);

  const generateMergeSuggestions = useCallback(async (applicantName: string): Promise<MergeSuggestion[]> => {
    return writing.generateMergeSuggestions(project.projectId, project.llmProvider, applicantName);
  }, [writing.generateMergeSuggestions, project.projectId, project.llmProvider]);

  const confirmMerges = useCallback(async (confirmations: Array<{suggestion_id: string; status: string}>) => {
    return writing.confirmMerges(project.projectId, confirmations);
  }, [writing.confirmMerges, project.projectId]);

  const applyMerges = useCallback(async () => {
    return writing.applyMerges(project.projectId, snippets.setSnippets);
  }, [writing.applyMerges, project.projectId, snippets.setSnippets]);

  const loadMergeSuggestions = useCallback(async () => {
    return writing.loadMergeSuggestions(project.projectId);
  }, [writing.loadMergeSuggestions, project.projectId]);

  // isElementHighlighted: bind the cross-context data
  const isElementHighlighted = useCallback((elementType: 'snippet' | 'standard', elementId: string): boolean => {
    return ui.isElementHighlighted(elementType, elementId, snippets.connections, snippets.allSnippets, args.arguments, args.argumentMappings);
  }, [ui.isElementHighlighted, snippets.connections, snippets.allSnippets, args.arguments, args.argumentMappings]);

  // Computed properties for pipeline state
  const canExtract = project.pipelineState.stage === 'ocr_complete';
  const canConfirm = project.pipelineState.stage === 'snippets_ready';
  const canGenerate = project.pipelineState.stage === 'mapping_confirmed';

  return useMemo(() => ({
    // ProjectContext
    projectId: project.projectId,
    setProjectId: project.setProjectId,
    isLoading: project.isLoading,
    loadError: project.loadError,
    llmProvider: project.llmProvider,
    setLlmProvider: project.setLlmProvider,
    workMode: ui.workMode,
    setWorkMode: ui.setWorkMode,
    pipelineState: project.pipelineState,
    projectType: project.projectType,
    projectNumber: project.projectNumber,
    legalStandards: project.legalStandards,

    // SnippetsContext
    allSnippets: snippets.allSnippets,
    connections: snippets.connections,
    addSnippet: snippets.addSnippet,
    removeSnippet: snippets.removeSnippet,
    addConnection: snippets.addConnection,
    removeConnection: snippets.removeConnection,
    confirmConnection: snippets.confirmConnection,
    getConnectionsForSnippet: snippets.getConnectionsForSnippet,
    getConnectionsForStandard: snippets.getConnectionsForStandard,
    selectionState: snippets.selectionState,
    setSelectionState: snippets.setSelectionState,
    startSelection: snippets.startSelection,
    updateSelection: snippets.updateSelection,
    endSelection: snippets.endSelection,
    cancelSelection: snippets.cancelSelection,

    // ArgumentsContext (with bound projectId/llmProvider)
    arguments: args.arguments,
    addArgument: args.addArgument,
    updateArgument: args.updateArgument,
    removeArgument,
    updateArgumentPosition: args.updateArgumentPosition,
    addSnippetToArgument: args.addSnippetToArgument,
    removeSnippetFromArgument: args.removeSnippetFromArgument,
    argumentMappings: args.argumentMappings,
    addArgumentMapping: args.addArgumentMapping,
    removeArgumentMapping: args.removeArgumentMapping,
    subArguments: args.subArguments,
    addSubArgument,
    updateSubArgument: args.updateSubArgument,
    removeSubArgument,
    regenerateSubArgument,
    mergeSubArguments,
    moveSubArguments,
    consolidateSubArguments,
    createArgument,
    moveToOverallMerits,
    isGeneratingArguments: args.isGeneratingArguments,
    generateArguments,
    generatedMainSubject: args.generatedMainSubject,
    rewriteStandard,
    rewritingStandardKey: writing.rewritingStandardKey,
    removeStandard,

    // UIContext
    focusState: ui.focusState,
    setFocusState: ui.setFocusState,
    clearFocus: ui.clearFocus,
    selectedSnippetId: ui.selectedSnippetId,
    setSelectedSnippetId: ui.setSelectedSnippetId,
    selectedDocumentId: ui.selectedDocumentId,
    setSelectedDocumentId: ui.setSelectedDocumentId,
    viewMode: ui.viewMode,
    setViewMode: ui.setViewMode,
    argumentViewMode: ui.argumentViewMode,
    setArgumentViewMode: ui.setArgumentViewMode,
    argumentGraphPositions: ui.argumentGraphPositions,
    updateArgumentGraphPosition: ui.updateArgumentGraphPosition,
    clearArgumentGraphPositions: ui.clearArgumentGraphPositions,
    draggedSnippetId: ui.draggedSnippetId,
    setDraggedSnippetId: ui.setDraggedSnippetId,
    draggedArgumentId: ui.draggedArgumentId,
    setDraggedArgumentId: ui.setDraggedArgumentId,
    hoveredSnippetId: ui.hoveredSnippetId,
    setHoveredSnippetId: ui.setHoveredSnippetId,
    snippetPositions: ui.snippetPositions,
    updateSnippetPosition: ui.updateSnippetPosition,
    pdfBboxPositions: ui.pdfBboxPositions,
    updatePdfBboxPosition: ui.updatePdfBboxPosition,
    argumentPositions: ui.argumentPositions,
    updateArgumentPosition2: ui.updateArgumentPosition2,
    subArgumentPositions: ui.subArgumentPositions,
    updateSubArgumentPosition: ui.updateSubArgumentPosition,
    snippetPanelBounds: ui.snippetPanelBounds,
    setSnippetPanelBounds: ui.setSnippetPanelBounds,
    writingTreePanelBounds: ui.writingTreePanelBounds,
    setWritingTreePanelBounds: ui.setWritingTreePanelBounds,
    isElementHighlighted,

    // WritingContext (with bound projectId/llmProvider)
    writingEdges: writing.writingEdges,
    addWritingEdge: writing.addWritingEdge,
    removeWritingEdge: writing.removeWritingEdge,
    confirmWritingEdge: writing.confirmWritingEdge,
    letterSections: writing.letterSections,
    updateLetterSection: writing.updateLetterSection,
    writingNodePositions: writing.writingNodePositions,
    updateWritingNodePosition: writing.updateWritingNodePosition,

    // Exploration writing toggle
    explorationWriting: writing.explorationWriting,
    setExplorationWriting: writing.setExplorationWriting,

    // Stale marking
    markSectionStale: writing.markSectionStale,

    // Change cascade (bound)
    acceptSuggestion: writing.acceptSuggestion,
    rejectSuggestion: writing.rejectSuggestion,
    commitChanges,
    dismissChanges: writing.dismissChanges,

    // Pipeline (bound)
    extractSnippets,
    confirmAllMappings,
    generatePetition,
    reloadSnippets,
    canExtract,
    canConfirm,
    canGenerate,

    // Unified Extraction (bound)
    unifiedExtract,
    generateMergeSuggestions,
    confirmMerges,
    applyMerges,
    mergeSuggestions: writing.mergeSuggestions,
    loadMergeSuggestions,
    isExtracting: writing.isExtracting,
    isMerging: writing.isMerging,
    extractionProgress: writing.extractionProgress,
  }), [
    project, snippets, args, ui, writing,
    generateArguments, addSubArgument, removeSubArgument, regenerateSubArgument, mergeSubArguments, moveSubArguments, consolidateSubArguments, createArgument, moveToOverallMerits,
    rewriteStandard, removeStandard,
    removeArgument, commitChanges, extractSnippets, confirmAllMappings, generatePetition,
    reloadSnippets, unifiedExtract, generateMergeSuggestions, confirmMerges,
    applyMerges, loadMergeSuggestions, isElementHighlighted,
    canExtract, canConfirm, canGenerate,
  ]);
}
