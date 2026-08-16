/**
 * Query key factory (M11). Every server-state query/mutation uses these so
 * invalidation is by construction consistent.
 */
export const queryKeys = {
  project: (id: string) => ['project', id] as const,
  standards: (id: string) => ['standards', id] as const,
  arguments: (id: string) => ['arguments', id] as const,
  snippets: (id: string) => ['snippets', id] as const,
  sections: (id: string) => ['sections', id] as const,
  exhibits: (id: string) => ['exhibits', id] as const,
  mergeSuggestions: (id: string) => ['merge-suggestions', id] as const,
  job: (id: string) => ['job', id] as const,
  projects: () => ['projects'] as const,
};
