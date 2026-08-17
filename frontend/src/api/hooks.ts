/**
 * Server-state hooks (M11): queries + mutations over the backend API.
 *
 * Contexts hydrate their local state from these queries and call these
 * mutations; nothing outside src/api should call apiClient for server state.
 * Structural mutations invalidate ['arguments', id]; letter mutations
 * invalidate ['sections', id]; snippet mutations invalidate ['snippets', id].
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiClient, type JobRecord, type PostJobOptions } from '../services/api';
import { queryKeys } from './keys';
import type {
  AnalyzeImpactResponse,
  ArgumentsResponse,
  CoverageResponse,
  ExtractResult,
  ProjectInfo,
  SectionsResponse,
  SentenceAPI,
  SnippetsResponse,
  StandardsResponse,
  SuccessResponse,
  WriteV3Result,
} from './types';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useProjectQuery(projectId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.project(projectId ?? ''),
    queryFn: () => apiClient.get<ProjectInfo>(`/projects/${projectId}`),
    enabled: !!projectId,
  });
}

export function useStandardsQuery(projectId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.standards(projectId ?? ''),
    queryFn: () => apiClient.get<StandardsResponse>(`/projects/${projectId}/standards`),
    enabled: !!projectId,
  });
}

export function useArgumentsQuery(projectId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.arguments(projectId ?? ''),
    queryFn: () => apiClient.get<ArgumentsResponse>(`/arguments/${projectId}`),
    enabled: !!projectId,
  });
}

export function useCoverageQuery(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.coverage(projectId ?? ''),
    queryFn: () => apiClient.get<CoverageResponse>(`/arguments/${projectId}/coverage`),
    enabled: !!projectId && enabled,
  });
}

export function useSnippetsQuery(projectId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.snippets(projectId ?? ''),
    queryFn: () => apiClient.get<SnippetsResponse>(`/extraction/${projectId}/snippets?limit=2000`),
    enabled: !!projectId,
  });
}

export function useSectionsQuery(projectId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.sections(projectId ?? ''),
    queryFn: () => apiClient.get<SectionsResponse>(`/write/v3/${projectId}/sections`),
    enabled: !!projectId,
  });
}

/** Poll a background job. Interval backs off 1s -> 5s and stops when terminal. */
export function useJob<T = unknown>(jobId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.job(jobId ?? ''),
    queryFn: () => apiClient.get<JobRecord<T>>(`/jobs/${jobId}`),
    enabled: !!jobId,
    staleTime: 0,
    refetchInterval: (query) => {
      const job = query.state.data as JobRecord | undefined;
      if (!job) return 1000;
      if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') return false;
      const n = query.state.dataUpdateCount;
      return Math.min(5000, 1000 * Math.pow(1.5, Math.min(n, 4)));
    },
  });
}

// ---------------------------------------------------------------------------
// Invalidation helpers
// ---------------------------------------------------------------------------

export function useInvalidate() {
  const qc = useQueryClient();
  return {
    arguments: useCallback((projectId: string) => qc.invalidateQueries({ queryKey: queryKeys.arguments(projectId) }), [qc]),
    snippets: useCallback((projectId: string) => qc.invalidateQueries({ queryKey: queryKeys.snippets(projectId) }), [qc]),
    sections: useCallback((projectId: string) => qc.invalidateQueries({ queryKey: queryKeys.sections(projectId) }), [qc]),
    project: useCallback((projectId: string) => qc.invalidateQueries({ queryKey: queryKeys.project(projectId) }), [qc]),
    all: useCallback((projectId: string) => Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.arguments(projectId) }),
      qc.invalidateQueries({ queryKey: queryKeys.snippets(projectId) }),
      qc.invalidateQueries({ queryKey: queryKeys.sections(projectId) }),
    ]), [qc]),
  };
}

// ---------------------------------------------------------------------------
// Mutations -- structure (all invalidate ['arguments', id])
// ---------------------------------------------------------------------------

function useArgumentsMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  getProjectId: (vars: TVars) => string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.arguments(getProjectId(vars)) });
    },
  });
}

export interface UpdateSubArgumentVars {
  projectId: string;
  subArgumentId: string;
  patch: {
    title?: string;
    purpose?: string;
    relationship?: string;
    snippet_ids?: string[];
    pending_snippet_ids?: string[];
    needs_snippet_confirmation?: boolean;
    status?: string;
  };
}

/** PUT /arguments/{pid}/subarguments/{id}. Fired on every snippet drag; the
 *  optimistic local edit lives in ArgumentsContext, this persists it. */
export function useUpdateSubArgument() {
  return useArgumentsMutation(
    (v: UpdateSubArgumentVars) => apiClient.put<SuccessResponse>(`/arguments/${v.projectId}/subarguments/${v.subArgumentId}`, v.patch),
    (v) => v.projectId,
  );
}

export function useCreateSubArgument() {
  return useArgumentsMutation(
    (v: { projectId: string; argument_id: string; title: string; purpose: string; relationship: string; snippet_ids: string[] }) =>
      apiClient.post<{ success: boolean; subargument: import('./types').BackendSubArgument }>(`/arguments/${v.projectId}/subarguments`, {
        argument_id: v.argument_id, title: v.title, purpose: v.purpose, relationship: v.relationship, snippet_ids: v.snippet_ids,
      }),
    (v) => v.projectId,
  );
}

export function useDeleteSubArgument() {
  return useArgumentsMutation(
    (v: { projectId: string; subArgumentId: string }) =>
      apiClient.delete<{ success: boolean; writing_changes?: unknown }>(`/arguments/${v.projectId}/subarguments/${v.subArgumentId}`),
    (v) => v.projectId,
  );
}

export function useCreateArgument() {
  return useArgumentsMutation(
    (v: { projectId: string; standard_key: string; title?: string }) =>
      apiClient.post<{ success: boolean; argument: import('./types').BackendArgument }>(`/arguments/${v.projectId}/arguments`, {
        standard_key: v.standard_key, title: v.title ?? '',
      }),
    (v) => v.projectId,
  );
}

export function useMoveSubArguments() {
  return useArgumentsMutation(
    (v: { projectId: string; subargument_ids: string[]; target_argument_id: string }) =>
      apiClient.post<{ success: boolean; moved_subargument_ids: string[]; target_argument_id: string }>(`/arguments/${v.projectId}/subarguments/move`, {
        subargument_ids: v.subargument_ids, target_argument_id: v.target_argument_id,
      }),
    (v) => v.projectId,
  );
}

export function useMergeSubArguments() {
  return useArgumentsMutation(
    (v: { projectId: string; subargument_ids: string[]; merged_title: string; merged_purpose: string; merged_relationship: string }) =>
      apiClient.post<{
        success: boolean;
        new_argument: import('./types').BackendArgument;
        merged_subargument?: import('./types').BackendSubArgument;
        moved_subargument_ids?: string[];
        deleted_subargument_ids?: string[];
      }>(`/arguments/${v.projectId}/subarguments/merge`, {
        subargument_ids: v.subargument_ids, merged_title: v.merged_title, merged_purpose: v.merged_purpose, merged_relationship: v.merged_relationship,
      }),
    (v) => v.projectId,
  );
}

export function useConsolidateSubArguments() {
  return useArgumentsMutation(
    (v: { projectId: string; subargument_ids: string[]; target_argument_id: string; provider: string }) =>
      apiClient.post<{ success: boolean; new_subargument: import('./types').BackendSubArgument; deleted_subargument_ids: string[] }>(
        `/arguments/${v.projectId}/subarguments/consolidate`,
        { subargument_ids: v.subargument_ids, target_argument_id: v.target_argument_id, provider: v.provider },
      ),
    (v) => v.projectId,
  );
}

export function useRemoveStandard() {
  return useArgumentsMutation(
    (v: { projectId: string; standardKey: string }) =>
      apiClient.delete<{ success: boolean; deleted_argument_ids: string[]; deleted_subargument_ids: string[] }>(`/arguments/${v.projectId}/standards/${v.standardKey}`),
    (v) => v.projectId,
  );
}

export function useMoveToOverallMerits() {
  return useArgumentsMutation(
    (v: { projectId: string; level: 'standard' | 'argument' | 'subargument'; target_id: string }) =>
      apiClient.post<{ success: boolean; moved_argument_ids: string[]; moved_subargument_ids: string[] }>(`/arguments/${v.projectId}/move-to-overall-merits`, {
        level: v.level, target_id: v.target_id,
      }),
    (v) => v.projectId,
  );
}

/** Whole organizer pipeline (background job). */
export function useGenerateArguments() {
  return useArgumentsMutation(
    (v: { projectId: string; provider: string; force_reanalyze?: boolean; applicant_name?: string; job?: PostJobOptions }) =>
      apiClient.postJob<SuccessResponse>(`/arguments/${v.projectId}/generate`, {
        force_reanalyze: !!v.force_reanalyze, applicant_name: v.applicant_name, provider: v.provider,
      }, v.job),
    (v) => v.projectId,
  );
}

/** Organizer for a single standard (background job). */
export function useRegenerateStandard() {
  return useArgumentsMutation(
    (v: { projectId: string; standardKey: string; provider: string }) =>
      apiClient.post<SuccessResponse>(`/arguments/${v.projectId}/regenerate-standard`, { standard_key: v.standardKey, provider: v.provider }),
    (v) => v.projectId,
  );
}

// ---------------------------------------------------------------------------
// Mutations -- writing (invalidate ['sections', id])
// ---------------------------------------------------------------------------

export interface WriteSectionVars {
  projectId: string;
  standardKey: string;
  provider: string;
  exploration_writing?: boolean;
  subargument_ids?: string[];
  argument_ids?: string[];
  additional_instructions?: string;
  job?: PostJobOptions;
}

/** POST /write/v3/{pid}/{key} as a background job; resolves with the result. */
export function useWriteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: WriteSectionVars) => apiClient.postJob<WriteV3Result>(`/write/v3/${v.projectId}/${v.standardKey}`, {
      provider: v.provider,
      exploration_writing: v.exploration_writing ?? false,
      ...(v.subargument_ids ? { subargument_ids: v.subargument_ids } : {}),
      ...(v.argument_ids ? { argument_ids: v.argument_ids } : {}),
      ...(v.additional_instructions ? { additional_instructions: v.additional_instructions } : {}),
    }, v.job),
    onSuccess: (_d, v) => {
      // The server now has a new version of this section; the local letter
      // state is updated by the caller (it merges the result), so we only
      // mark the cached snapshot stale for the next project load.
      void qc.invalidateQueries({ queryKey: queryKeys.sections(v.projectId), refetchType: 'none' });
    },
  });
}

/** Persist the section exactly as shown (accept/revert regeneration, edits) — M13. */
export function usePutSectionSentences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { projectId: string; standardKey: string; sentences: SentenceAPI[]; source: 'user_commit' | 'user_revert' | 'user_edit' }) =>
      apiClient.put<{ success: boolean; version_id: string; sentence_count: number }>(
        `/write/v3/${v.projectId}/${v.standardKey}/sentences`,
        { sentences: v.sentences, source: v.source },
      ),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: queryKeys.sections(v.projectId), refetchType: 'none' });
    },
  });
}

export function useAnalyzeImpact() {
  return useMutation({
    mutationFn: (v: { projectId: string; standard_key: string; change_type: string; affected_subargument_id: string; affected_title: string }) =>
      apiClient.post<AnalyzeImpactResponse>(`/write/v3/${v.projectId}/analyze-impact`, {
        standard_key: v.standard_key, change_type: v.change_type,
        affected_subargument_id: v.affected_subargument_id, affected_title: v.affected_title,
      }),
  });
}

// ---------------------------------------------------------------------------
// Mutations -- extraction (invalidate ['snippets', id])
// ---------------------------------------------------------------------------

export function useExtract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { projectId: string; applicant_name?: string; provider?: string; job?: PostJobOptions }) =>
      apiClient.postJob<ExtractResult>(`/extraction/${v.projectId}/extract`, {
        ...(v.applicant_name ? { applicant_name: v.applicant_name } : {}),
        ...(v.provider ? { provider: v.provider } : {}),
      }, v.job),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: queryKeys.snippets(v.projectId) });
      void qc.invalidateQueries({ queryKey: queryKeys.arguments(v.projectId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Queries / mutations -- exhibits, AI helpers, merge suggestions
// ---------------------------------------------------------------------------

export interface ExhibitAPI {
  id: string;
  name: string;
  category: string;
  pdf_url: string;
  page_count: number;
}

export function useExhibitsQuery(projectId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.exhibits(projectId ?? ''),
    queryFn: () => apiClient.get<{ project_id: string; total: number; exhibits: ExhibitAPI[] }>(`/documents/${projectId}/exhibits`),
    enabled: !!projectId,
  });
}

/** LLM: relationship phrase for a SubArgument title (no server state change). */
export function useInferRelationship() {
  return useMutation({
    mutationFn: (v: { projectId: string; argument_id: string; subargument_title: string; provider?: string }) =>
      apiClient.post<{ success: boolean; relationship: string }>(`/arguments/${v.projectId}/infer-relationship`, {
        argument_id: v.argument_id, subargument_title: v.subargument_title, ...(v.provider ? { provider: v.provider } : {}),
      }),
  });
}

export interface RecommendedSnippetAPI {
  snippet_id: string;
  text: string;
  exhibit_id: string;
  page: number;
  relevance_score: number;
  reason: string;
}

/** LLM: snippet recommendations for a SubArgument (no server state change). */
export function useRecommendSnippets() {
  return useMutation({
    mutationFn: (v: { projectId: string; argument_id: string; title: string; description?: string; exclude_snippet_ids?: string[]; provider?: string }) =>
      apiClient.post<{ success: boolean; recommended_snippets: RecommendedSnippetAPI[]; total_available: number }>(`/arguments/${v.projectId}/recommend-snippets`, {
        argument_id: v.argument_id, title: v.title, description: v.description, exclude_snippet_ids: v.exclude_snippet_ids ?? [],
        ...(v.provider ? { provider: v.provider } : {}),
      }),
  });
}

/** LLM: title for an Argument. */
export function useInferArgumentTitle() {
  return useMutation({
    mutationFn: (v: { projectId: string; argument_id: string; provider?: string }) =>
      apiClient.post<{ success: boolean; title: string }>(`/arguments/${v.projectId}/infer-argument-title`, {
        argument_id: v.argument_id, ...(v.provider ? { provider: v.provider } : {}),
      }),
  });
}

export interface MergeSuggestionsResponse<T = unknown> {
  project_id: string;
  suggestions: T[];
  status?: { pending: number; accepted: number; rejected: number; applied: number };
}

export function useMergeSuggestionsQuery<T = unknown>(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.mergeSuggestions(projectId ?? ''),
    queryFn: () => apiClient.get<MergeSuggestionsResponse<T>>(`/extraction/${projectId}/merge-suggestions`),
    enabled: !!projectId && enabled,
  });
}

export function useGenerateMergeSuggestions<T = unknown>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { projectId: string; applicant_name: string; provider: string }) =>
      apiClient.post<{ success: boolean; suggestion_count: number; suggestions: T[] }>(`/extraction/${v.projectId}/merge-suggestions/generate`, {
        applicant_name: v.applicant_name, provider: v.provider,
      }),
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: queryKeys.mergeSuggestions(v.projectId) }); },
  });
}

export function useConfirmMerges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { projectId: string; confirmations: Array<{ suggestion_id: string; status: string }> }) =>
      apiClient.post<{ success: boolean; updated: number }>(`/extraction/${v.projectId}/merges/confirm`, v.confirmations),
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: queryKeys.mergeSuggestions(v.projectId) }); },
  });
}

export function useApplyMerges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { projectId: string }) =>
      apiClient.post<{ success: boolean; applied_count: number; updated_snippets: number; updated_relations: number; error?: string }>(`/extraction/${v.projectId}/merges/apply`, {}),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: queryKeys.snippets(v.projectId) });
      void qc.invalidateQueries({ queryKey: queryKeys.mergeSuggestions(v.projectId) });
    },
  });
}

/** Imperative fetch of merge suggestions through the query cache (bypasses staleness). */
export function useFetchMergeSuggestions<T = unknown>() {
  const qc = useQueryClient();
  return useCallback((projectId: string) => qc.fetchQuery({
    queryKey: queryKeys.mergeSuggestions(projectId),
    queryFn: () => apiClient.get<MergeSuggestionsResponse<T>>(`/extraction/${projectId}/merge-suggestions`),
    staleTime: 0,
  }), [qc]);
}
