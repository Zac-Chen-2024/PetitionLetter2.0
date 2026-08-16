import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { interactionLogger } from '../services/interactionLogger';
import type { LLMProvider, LegalStandard, PipelineState, ProjectType } from '../types';
import { toLLMProvider } from '../types';
import { legalStandards as defaultEB1AStandards } from '../data/legalStandards';
import { useProjectQuery, useStandardsQuery } from '../api';

// ============================================
// ProjectContext
// Provides: project identity, LLM provider, pipeline stage (UI state) and the
// project's server-side info (type, number, standards) via TanStack Query (M11).
// ============================================

const STORAGE_KEY_LLM_PROVIDER = 'evidence-system-llm-provider';
const STORAGE_KEY_PROJECT_ID = 'evidence-system-project-id';
const DEFAULT_PROJECT_ID = 'yaruo_qu';

export interface ProjectContextType {
  projectId: string;
  setProjectId: (id: string) => void;
  /** True while any of the project's core queries is loading for the first time. */
  isLoading: boolean;
  loadError: string | null;
  llmProvider: LLMProvider;
  setLlmProvider: (provider: LLMProvider) => void;
  pipelineState: PipelineState;
  setPipelineState: React.Dispatch<React.SetStateAction<PipelineState>>;
  projectType: ProjectType;
  projectNumber: string | null;
  legalStandards: LegalStandard[];
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const VALID_TYPES: ProjectType[] = ['EB-1A', 'NIW', 'L-1A'];

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_PROJECT_ID) || DEFAULT_PROJECT_ID;
  });

  const setProjectId = useCallback((id: string) => {
    setProjectIdState(id);
    localStorage.setItem(STORAGE_KEY_PROJECT_ID, id);
  }, []);

  // LLM Provider setting (local preference, not server state)
  const [llmProvider, setLlmProviderState] = useState<LLMProvider>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LLM_PROVIDER);
    return toLLMProvider(saved);
  });

  // Pipeline state (UI)
  const [pipelineState, setPipelineState] = useState<PipelineState>({
    stage: 'ocr_complete',
    progress: 0,
  });

  const setLlmProvider = useCallback((provider: LLMProvider) => {
    setLlmProviderState(provider);
    localStorage.setItem(STORAGE_KEY_LLM_PROVIDER, provider);
  }, []);

  // Keep the interaction logger's project_id in sync
  useEffect(() => {
    interactionLogger.setProjectId(projectId || null);
  }, [projectId]);

  // Server state
  const projectQ = useProjectQuery(projectId);
  const standardsQ = useStandardsQuery(projectId);

  const projectType: ProjectType = useMemo(() => {
    const t = projectQ.data?.projectType as ProjectType | undefined;
    return t && VALID_TYPES.includes(t) ? t : 'EB-1A';
  }, [projectQ.data]);
  const projectNumber = projectQ.data?.projectNumber ?? null;
  const legalStandards = useMemo<LegalStandard[]>(() => {
    const s = standardsQ.data?.standards;
    return s && s.length > 0 ? (s as unknown as LegalStandard[]) : defaultEB1AStandards;
  }, [standardsQ.data]);

  // Reset pipeline stage when the project changes
  useEffect(() => {
    setPipelineState(prev => ({ ...prev, stage: 'ocr_complete', progress: 0, error: undefined }));
  }, [projectId]);

  const isLoading = projectQ.isLoading || standardsQ.isLoading;
  const loadError = projectQ.error ? (projectQ.error as Error).message : null;

  const value = useMemo<ProjectContextType>(() => ({
    projectId,
    setProjectId,
    isLoading,
    loadError,
    llmProvider,
    setLlmProvider,
    pipelineState,
    setPipelineState,
    projectType,
    projectNumber,
    legalStandards,
  }), [projectId, setProjectId, isLoading, loadError, llmProvider, pipelineState, setLlmProvider, projectType, projectNumber, legalStandards]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
