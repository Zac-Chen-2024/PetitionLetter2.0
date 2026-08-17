/**
 * Wire types for the backend API (single source of truth, M11).
 *
 * Every response shape the frontend consumes is declared exactly once here.
 * Contexts/components import these instead of inlining `apiClient.get<{...}>`
 * shapes (WritingContext alone used to carry four copies of the v3 response).
 */

import type { ProvenanceIndexAPI } from '../types';

// ---- projects ---------------------------------------------------------------

export interface ProjectInfo {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string | null;
  beneficiaryName?: string | null;
  petitionerName?: string | null;
  foreignEntityName?: string | null;
  projectType?: string;
  projectNumber?: string | null;
}

export interface StandardsResponse {
  success: boolean;
  projectType: string;
  standards: Array<{
    id: string;
    key?: string;
    name: string;
    shortName?: string;
    description?: string;
    legalRef?: string;
    color?: string;
    order: number;
    [k: string]: unknown;
  }>;
}

// ---- snippets ---------------------------------------------------------------

export interface BBoxAPI {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** /extraction/{id}/snippets */
export interface UnifiedSnippetAPI {
  snippet_id: string;
  block_id?: string;
  exhibit_id: string;
  text: string;
  subject?: string;
  subject_role?: string;
  is_applicant_achievement?: boolean;
  evidence_type?: string;
  confidence?: number;
  reasoning?: string;
  page?: number;
  bbox?: BBoxAPI | null;
  document_id?: string;
}

export interface SnippetsResponse {
  project_id: string;
  total: number;
  snippets: UnifiedSnippetAPI[];
}

// ---- arguments --------------------------------------------------------------

export interface BackendLayerItem {
  text: string;
  exhibit_id: string;
  purpose: string;
  snippet_id: string;
}

export interface BackendArgument {
  id: string;
  title: string;
  subject: string;
  snippet_ids: string[];
  standard_key: string;
  confidence?: number;
  is_ai_generated: boolean;
  sub_argument_ids?: string[];
  created_at: string;
  exhibits?: string[];
  layers?: {
    claim: BackendLayerItem[];
    proof: BackendLayerItem[];
    significance: BackendLayerItem[];
    context: BackendLayerItem[];
  };
  conclusion?: string;
  completeness?: { has_claim: boolean; has_proof: boolean; has_significance: boolean; has_context: boolean; score: number };
}

export interface BackendSubArgument {
  id: string;
  argument_id: string;
  title: string;
  purpose: string;
  relationship: string;
  snippet_ids: string[];
  pending_snippet_ids?: string[];
  needs_snippet_confirmation?: boolean;
  is_ai_generated: boolean;
  status: string;
  created_at: string;
}

export interface ArgumentsResponse {
  project_id: string;
  arguments: BackendArgument[];
  sub_arguments: BackendSubArgument[];
  main_subject: string | null;
  generated_at: string | null;
  stats?: Record<string, unknown>;
  filtered?: unknown[];
}

// ---- writing v3 -------------------------------------------------------------

export interface SentenceAPI {
  text: string;
  snippet_ids: string[];
  subargument_id?: string | null;
  argument_id?: string | null;
  exhibit_refs?: string[];
  sentence_type?: 'opening' | 'body' | 'closing';
}

export interface WriteV3Result {
  success: boolean;
  section: string;
  paragraph_text: string;
  sentences: SentenceAPI[];
  provenance_index?: ProvenanceIndexAPI;
  validation?: { total_sentences: number; traced_sentences: number; warnings: string[] };
  error?: string | null;
  updated_subargument_snippets?: Record<string, string[]> | null;
}

export interface SectionsResponse {
  success: boolean;
  project_id: string;
  sections: Array<{
    section: string;
    paragraph_text: string;
    sentences: SentenceAPI[];
    provenance_index?: ProvenanceIndexAPI;
    validation?: WriteV3Result['validation'];
    version_id?: string;
    timestamp?: string;
  }>;
  section_count: number;
}

export interface AnalyzeImpactResponse {
  success: boolean;
  suggestions: Array<{ sentence_index: number; original_text: string; suggested_text: string; reason: string }>;
}

// ---- extraction / merges ---------------------------------------------------------

export interface ExtractResult {
  success: boolean;
  exhibits_processed?: number;
  total_snippets?: number;
  total_entities?: number;
  total_relations?: number;
  error?: string;
}

// ---- generic ---------------------------------------------------------------------

export interface SuccessResponse {
  success: boolean;
  [k: string]: unknown;
}

// ---- Evidence coverage overview (M13) ----
export interface CoverageSubArgBrief {
  id: string;
  title: string;
  argument_id: string;
  snippet_count: number;
}

export interface CoverageStandard {
  standard_key: string;
  argument_count: number;
  subargument_count: number;
  snippet_count: number;
  single_evidence_subarguments: CoverageSubArgBrief[];
  empty_subarguments: CoverageSubArgBrief[];
  layer_counts: Record<string, number>;
  layer_gaps: string[];
}

export interface CoverageUnassignedSnippet {
  snippet_id: string;
  exhibit_id: string;
  page: number | null;
  evidence_type?: string | null;
  evidence_layer?: string | null;
  is_applicant_achievement?: boolean | null;
  text: string;
}

export interface CoverageResponse {
  success: boolean;
  project_id: string;
  totals: {
    snippets: number;
    assigned_snippets: number;
    unassigned_snippets: number;
    arguments: number;
    sub_arguments: number;
  };
  unassigned_by_exhibit: Record<string, number>;
  unassigned_snippets: CoverageUnassignedSnippet[];
  standards: CoverageStandard[];
}
