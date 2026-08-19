import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Argument, SubArgument, WritingEdge, Position, ArgumentStatus } from '../types';
import {
  argumentsFromAPI,
  subArgumentsFromAPI,
  queryKeys,
  useArgumentsQuery,
  useConsolidateSubArguments,
  useCreateArgument,
  useCreateSubArgument,
  useDeleteSubArgument,
  useGenerateArguments,
  useMergeSubArguments,
  useMoveSubArguments,
  useMoveToOverallMerits,
  useRegenerateStandard,
  useRemoveStandard,
  useUpdateSubArgument,
} from '../api';
import { useProject } from './ProjectContext';

// ============================================
// ArgumentsContext (M11: server state via TanStack Query)
//
// `arguments` / `subArguments` are a local working copy hydrated from the
// ['arguments', projectId] query. Every structural mutation goes through the
// api/ mutation hooks, which invalidate that query; the refetch re-hydrates
// this state, so no hand-written "mirror the server change locally" code is
// needed any more. Only cheap, high-frequency edits (title typing, snippet
// assignment) are applied optimistically before persisting.
// ============================================

export interface ArgumentsContextType {
  arguments: Argument[];
  setArguments: React.Dispatch<React.SetStateAction<Argument[]>>;
  addArgument: (argument: Omit<Argument, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateArgument: (id: string, updates: Partial<Omit<Argument, 'id' | 'createdAt'>>) => void;
  removeArgument: (id: string) => void;
  updateArgumentPosition: (id: string, position: Position) => void;
  addSnippetToArgument: (argumentId: string, snippetId: string) => void;
  removeSnippetFromArgument: (argumentId: string, snippetId: string) => void;
  argumentMappings: WritingEdge[];
  addArgumentMapping: (argumentId: string, standardKey: string) => void;
  removeArgumentMapping: (edgeId: string) => void;
  subArguments: SubArgument[];
  setSubArguments: React.Dispatch<React.SetStateAction<SubArgument[]>>;
  addSubArgument: (subArgument: Omit<SubArgument, 'id' | 'createdAt' | 'updatedAt'>, projectId: string) => Promise<SubArgument>;
  /** Optimistic local edit (no persistence). Pair with saveSubArgument. */
  updateSubArgument: (id: string, updates: Partial<Omit<SubArgument, 'id' | 'createdAt'>>) => void;
  /** Persist fields of a SubArgument (PUT). Applies the same edit locally first. */
  saveSubArgument: (id: string, updates: Partial<Pick<SubArgument, 'title' | 'purpose' | 'relationship' | 'snippetIds' | 'pendingSnippetIds' | 'needsSnippetConfirmation' | 'status'>>, projectId: string) => Promise<void>;
  removeSubArgument: (id: string, projectId: string) => void;
  regenerateSubArgument: (subArgumentId: string, projectId: string) => Promise<void>;
  mergeSubArguments: (subArgumentIds: string[], title: string, purpose: string, relationship: string, projectId: string) => Promise<{ newArgument: Argument; movedSubArgumentIds: string[] }>;
  moveSubArguments: (subArgumentIds: string[], targetArgumentId: string, projectId: string) => Promise<void>;
  consolidateSubArguments: (subArgumentIds: string[], targetArgumentId: string, projectId: string, llmProvider: string) => Promise<{ newSubArgument: SubArgument; deletedSubArgumentIds: string[] }>;
  createArgument: (standardKey: string, projectId: string) => Promise<Argument>;
  moveToOverallMerits: (level: 'standard' | 'argument' | 'subargument', targetId: string, projectId: string) => Promise<void>;
  removeStandard: (standardKey: string, projectId: string) => Promise<void>;
  isGeneratingArguments: boolean;
  generateArguments: (projectId: string, llmProvider: string, forceReanalyze?: boolean, applicantName?: string) => Promise<void>;
  regenerateStandard: (standardKey: string, projectId: string, llmProvider: string) => Promise<void>;
  generatedMainSubject: string | null;
  /** True while the ['arguments'] query is loading for the first time. */
  isLoading: boolean;
}

const ArgumentsContext = createContext<ArgumentsContextType | undefined>(undefined);

export function ArgumentsProvider({ children }: { children: ReactNode }) {
  const { projectId } = useProject();
  const qc = useQueryClient();

  // ---- server state -> local working copy ----
  const argsQ = useArgumentsQuery(projectId);
  const [arguments_, setArguments] = useState<Argument[]>([]);
  const [subArguments, setSubArguments] = useState<SubArgument[]>([]);
  useEffect(() => {
    if (argsQ.data) {
      setArguments(argumentsFromAPI(argsQ.data.arguments || []));
      setSubArguments(subArgumentsFromAPI(argsQ.data.sub_arguments || []));
    } else if (!argsQ.isLoading) {
      setArguments([]);
      setSubArguments([]);
    }
  }, [argsQ.data, argsQ.isLoading]);
  useEffect(() => { setArguments([]); setSubArguments([]); }, [projectId]);
  const generatedMainSubject = argsQ.data?.main_subject ?? null;

  /** Refetch ['arguments', id] and wait for it (used after structural mutations). */
  const refresh = useCallback(async (pid: string) => {
    await qc.invalidateQueries({ queryKey: queryKeys.arguments(pid) });
  }, [qc]);

  // ---- UI-only state ----
  const [argumentMappings, setArgumentMappings] = useState<WritingEdge[]>([]);
  const [isGeneratingArguments, setIsGeneratingArguments] = useState(false);

  // ---- mutations ----
  // (mutateAsync references are stable, so they are safe useCallback deps)
  const updateSubArgM = useUpdateSubArgument().mutateAsync;
  const createSubArgM = useCreateSubArgument().mutateAsync;
  const deleteSubArgM = useDeleteSubArgument().mutateAsync;
  const createArgM = useCreateArgument().mutateAsync;
  const moveM = useMoveSubArguments().mutateAsync;
  const mergeM = useMergeSubArguments().mutateAsync;
  const consolidateM = useConsolidateSubArguments().mutateAsync;
  const removeStandardM = useRemoveStandard().mutateAsync;
  const overallMeritsM = useMoveToOverallMerits().mutateAsync;
  const generateM = useGenerateArguments().mutateAsync;
  const regenerateStandardM = useRegenerateStandard().mutateAsync;

  // ---- local-only helpers (unchanged semantics) ----
  const addArgument = useCallback((argumentData: Omit<Argument, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newArgument: Argument = {
      ...argumentData,
      id: `arg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setArguments(prev => [...prev, newArgument]);
  }, []);

  const updateArgument = useCallback((id: string, updates: Partial<Omit<Argument, 'id' | 'createdAt'>>) => {
    setArguments(prev => prev.map(arg =>
      arg.id === id ? { ...arg, ...updates, updatedAt: new Date() } : arg
    ));
  }, []);

  const removeArgument = useCallback((id: string) => {
    setArguments(prev => prev.filter(arg => arg.id !== id));
    setArgumentMappings(prev => prev.filter(e => e.source !== id));
  }, []);

  const updateArgumentPosition = useCallback((id: string, position: Position) => {
    setArguments(prev => prev.map(arg =>
      arg.id === id ? { ...arg, position, updatedAt: new Date() } : arg
    ));
  }, []);

  const addSnippetToArgument = useCallback((argumentId: string, snippetId: string) => {
    setArguments(prev => prev.map(arg => {
      if (arg.id !== argumentId || arg.snippetIds.includes(snippetId)) return arg;
      return { ...arg, snippetIds: [...arg.snippetIds, snippetId], updatedAt: new Date() };
    }));
  }, []);

  const removeSnippetFromArgument = useCallback((argumentId: string, snippetId: string) => {
    setArguments(prev => prev.map(arg =>
      arg.id === argumentId ? { ...arg, snippetIds: arg.snippetIds.filter(id => id !== snippetId), updatedAt: new Date() } : arg
    ));
  }, []);

  const addArgumentMapping = useCallback((argumentId: string, standardKey: string) => {
    setArgumentMappings(prev => {
      if (prev.some(e => e.source === argumentId && e.target === standardKey)) return prev;
      return [...prev, {
        id: `am-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        source: argumentId, target: standardKey, type: 'argument-to-standard', isConfirmed: true, createdAt: new Date(),
      }];
    });
    setArguments(prev => prev.map(arg =>
      arg.id === argumentId ? { ...arg, standardKey, status: 'mapped' as const, updatedAt: new Date() } : arg
    ));
  }, []);

  const removeArgumentMapping = useCallback((edgeId: string) => {
    setArgumentMappings(prev => {
      const mapping = prev.find(e => e.id === edgeId);
      if (mapping) {
        setArguments(prevArgs => prevArgs.map(arg =>
          arg.id === mapping.source ? { ...arg, standardKey: undefined, status: 'verified' as const, updatedAt: new Date() } : arg
        ));
      }
      return prev.filter(e => e.id !== edgeId);
    });
  }, []);

  // ---- SubArgument management ----
  const addSubArgument = useCallback(async (
    subArgumentData: Omit<SubArgument, 'id' | 'createdAt' | 'updatedAt'>,
    pid: string
  ): Promise<SubArgument> => {
    const response = await createSubArgM({
      projectId: pid,
      argument_id: subArgumentData.argumentId,
      title: subArgumentData.title,
      purpose: subArgumentData.purpose,
      relationship: subArgumentData.relationship,
      snippet_ids: subArgumentData.snippetIds,
    });
    if (!response.success) throw new Error('Failed to create SubArgument');
    const [created] = subArgumentsFromAPI([response.subargument]);
    // Optimistic insert so the node appears before the refetch lands
    setSubArguments(prev => [...prev.filter(sa => sa.id !== created.id), created]);
    setArguments(prev => prev.map(arg =>
      arg.id === subArgumentData.argumentId
        ? { ...arg, subArgumentIds: [...(arg.subArgumentIds || []).filter(id => id !== created.id), created.id], updatedAt: new Date() }
        : arg
    ));
    return created;
  }, [createSubArgM]);

  const updateSubArgument = useCallback((id: string, updates: Partial<Omit<SubArgument, 'id' | 'createdAt'>>) => {
    setSubArguments(prev => prev.map(sa =>
      sa.id === id ? { ...sa, ...updates, updatedAt: new Date() } : sa
    ));
  }, []);

  const saveSubArgument = useCallback(async (
    id: string,
    updates: Partial<Pick<SubArgument, 'title' | 'purpose' | 'relationship' | 'snippetIds' | 'pendingSnippetIds' | 'needsSnippetConfirmation' | 'status'>>,
    pid: string,
  ) => {
    updateSubArgument(id, updates);
    await updateSubArgM({
      projectId: pid,
      subArgumentId: id,
      patch: {
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.purpose !== undefined ? { purpose: updates.purpose } : {}),
        ...(updates.relationship !== undefined ? { relationship: updates.relationship } : {}),
        ...(updates.snippetIds !== undefined ? { snippet_ids: updates.snippetIds } : {}),
        ...(updates.pendingSnippetIds !== undefined ? { pending_snippet_ids: updates.pendingSnippetIds } : {}),
        ...(updates.needsSnippetConfirmation !== undefined ? { needs_snippet_confirmation: updates.needsSnippetConfirmation } : {}),
        ...(updates.status !== undefined ? { status: updates.status } : {}),
      },
    });
  }, [updateSubArgM, updateSubArgument]);

  const removeSubArgument = useCallback((id: string, pid: string) => {
    // Optimistic removal; the mutation's invalidation re-syncs afterwards.
    setSubArguments(prev => {
      const subArg = prev.find(sa => sa.id === id);
      if (subArg) {
        setArguments(prevArgs => prevArgs.map(arg =>
          arg.id === subArg.argumentId
            ? { ...arg, subArgumentIds: (arg.subArgumentIds || []).filter(saId => saId !== id), updatedAt: new Date() }
            : arg
        ));
      }
      return prev.filter(sa => sa.id !== id);
    });
    if (pid) {
      deleteSubArgM({ projectId: pid, subArgumentId: id })
        .catch((error) => console.error('[ArgumentsContext] Failed to delete SubArgument from backend:', error));
    }
  }, [deleteSubArgM]);

  const regenerateSubArgument = useCallback(async (_subArgumentId: string, _projectId: string) => {
    console.warn('regenerateSubArgument should be called via useApp() facade which has access to WritingContext');
  }, []);

  const removeStandard = useCallback(async (standardKey: string, pid: string) => {
    const response = await removeStandardM({ projectId: pid, standardKey });
    if (response.success) {
      const deletedArgIds = new Set(response.deleted_argument_ids);
      const deletedSubArgIds = new Set(response.deleted_subargument_ids);
      setArguments(prev => prev.filter(a => !deletedArgIds.has(a.id)));
      setSubArguments(prev => prev.filter(sa => !deletedSubArgIds.has(sa.id)));
      setArgumentMappings(prev => prev.filter(e => !deletedArgIds.has(e.source)));
    }
  }, [removeStandardM]);

  const mergeSubArguments = useCallback(async (
    subArgumentIds: string[], title: string, purpose: string, relationship: string, pid: string
  ): Promise<{ newArgument: Argument; movedSubArgumentIds: string[] }> => {
    const response = await mergeM({
      projectId: pid, subargument_ids: subArgumentIds, merged_title: title, merged_purpose: purpose, merged_relationship: relationship,
    });
    if (!response.success) throw new Error('Failed to merge sub-arguments');
    const [newArgument] = argumentsFromAPI([response.new_argument]);
    await refresh(pid);
    return { newArgument, movedSubArgumentIds: response.moved_subargument_ids ?? subArgumentIds };
  }, [mergeM, refresh]);

  const moveSubArguments = useCallback(async (subArgumentIds: string[], targetArgumentId: string, pid: string): Promise<void> => {
    const response = await moveM({ projectId: pid, subargument_ids: subArgumentIds, target_argument_id: targetArgumentId });
    if (!response.success) throw new Error('Failed to move sub-arguments');
    await refresh(pid);
  }, [moveM, refresh]);

  const consolidateSubArguments = useCallback(async (
    subArgumentIds: string[], targetArgumentId: string, pid: string, llmProvider: string
  ): Promise<{ newSubArgument: SubArgument; deletedSubArgumentIds: string[] }> => {
    const response = await consolidateM({
      projectId: pid, subargument_ids: subArgumentIds, target_argument_id: targetArgumentId, provider: llmProvider,
    });
    if (!response.success) throw new Error('Failed to consolidate sub-arguments');
    const [newSubArgument] = subArgumentsFromAPI([response.new_subargument]);
    await refresh(pid);
    return { newSubArgument, deletedSubArgumentIds: response.deleted_subargument_ids };
  }, [consolidateM, refresh]);

  const createArgument = useCallback(async (standardKey: string, pid: string): Promise<Argument> => {
    const response = await createArgM({ projectId: pid, standard_key: standardKey, title: '' });
    if (!response.success) throw new Error('Failed to create argument');
    const [newArg] = argumentsFromAPI([response.argument]);
    setArguments(prev => [...prev.filter(a => a.id !== newArg.id), newArg]);
    return newArg;
  }, [createArgM]);

  const moveToOverallMerits = useCallback(async (level: 'standard' | 'argument' | 'subargument', targetId: string, pid: string) => {
    const response = await overallMeritsM({ projectId: pid, level, target_id: targetId });
    if (!response.success) throw new Error('Failed to move to Overall Merits');
    await refresh(pid);
  }, [overallMeritsM, refresh]);

  // ---- AI generation ----
  const generateArguments = useCallback(async (pid: string, llmProvider: string, forceReanalyze: boolean = false, applicantName?: string) => {
    setIsGeneratingArguments(true);
    try {
      await generateM({ projectId: pid, provider: llmProvider, force_reanalyze: forceReanalyze, applicant_name: applicantName });
      await refresh(pid);
    } finally {
      setIsGeneratingArguments(false);
    }
  }, [generateM, refresh]);

  const regenerateStandard = useCallback(async (standardKey: string, pid: string, llmProvider: string) => {
    await regenerateStandardM({ projectId: pid, standardKey, provider: llmProvider });
    await refresh(pid);
  }, [regenerateStandardM, refresh]);

  const value = useMemo<ArgumentsContextType>(() => ({
    arguments: arguments_,
    setArguments,
    addArgument,
    updateArgument,
    removeArgument,
    updateArgumentPosition,
    addSnippetToArgument,
    removeSnippetFromArgument,
    argumentMappings,
    addArgumentMapping,
    removeArgumentMapping,
    subArguments,
    setSubArguments,
    addSubArgument,
    updateSubArgument,
    saveSubArgument,
    removeSubArgument,
    regenerateSubArgument,
    mergeSubArguments,
    moveSubArguments,
    consolidateSubArguments,
    createArgument,
    moveToOverallMerits,
    removeStandard,
    isGeneratingArguments,
    generateArguments,
    regenerateStandard,
    generatedMainSubject,
    isLoading: argsQ.isLoading,
  }), [arguments_, argumentMappings, subArguments, isGeneratingArguments, generatedMainSubject, argsQ.isLoading,
    addArgument, updateArgument, removeArgument, updateArgumentPosition, addSnippetToArgument, removeSnippetFromArgument,
    addArgumentMapping, removeArgumentMapping, addSubArgument, updateSubArgument, saveSubArgument, removeSubArgument,
    regenerateSubArgument, mergeSubArguments, moveSubArguments, consolidateSubArguments, createArgument, moveToOverallMerits,
    removeStandard, generateArguments, regenerateStandard]);

  return <ArgumentsContext.Provider value={value}>{children}</ArgumentsContext.Provider>;
}

export function useArguments() {
  const context = useContext(ArgumentsContext);
  if (context === undefined) {
    throw new Error('useArguments must be used within an ArgumentsProvider');
  }
  return context;
}

// Backwards-compatible names used by a few call sites
export { argumentsFromAPI as convertBackendArguments, subArgumentsFromAPI as convertBackendSubArguments };
export type { ArgumentStatus };
