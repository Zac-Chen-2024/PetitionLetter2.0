// API client for document pipeline backend

import type { Document, Quote, L1Summary, Citation } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Manual analysis input type
interface ManualAnalysisInput {
  document_id: string;
  exhibit_id: string;
  file_name: string;
  quotes: Quote[];
}

// Generic fetch wrapper
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `API error: ${response.status}`);
  }

  return response.json();
}

// Document APIs
export const documentApi = {
  // Get all documents for a project
  getDocuments: (projectId: string) =>
    fetchApi<{ documents: Document[]; total: number }>(`/api/documents/${projectId}`),

  // Upload a document
  upload: async (projectId: string, file: File, exhibitNumber?: string, exhibitTitle?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', projectId);
    if (exhibitNumber) formData.append('exhibit_number', exhibitNumber);
    if (exhibitTitle) formData.append('exhibit_title', exhibitTitle);

    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return response.json();
  },
};

// L-1 Analysis APIs
export const analysisApi = {
  // Get L-1 standards info
  getStandards: () =>
    fetchApi<{ standards: Record<string, unknown>; count: number }>('/api/l1-standards'),

  // Run automatic L-1 analysis
  analyzeDocuments: (projectId: string, docIds?: string[]) => {
    const params = docIds && docIds.length > 0 ? `?doc_ids=${docIds.join(',')}` : '';
    return fetchApi<{
      success: boolean;
      project_id: string;
      total_docs_analyzed: number;
      total_quotes_found: number;
      errors?: { document_id: string; error: string }[];
      model_used: string;
    }>(`/api/l1-analyze/${projectId}${params}`, { method: 'POST' });
  },

  // Save manual analysis results
  saveManualAnalysis: (projectId: string, analyses: ManualAnalysisInput[]) =>
    fetchApi<{
      success: boolean;
      project_id: string;
      saved_count: number;
      total_quotes: number;
    }>(`/api/l1-manual-analysis/${projectId}`, {
      method: 'POST',
      body: JSON.stringify(analyses),
    }),

  // Get analysis summary
  getSummary: (projectId: string) =>
    fetchApi<L1Summary>(`/api/l1-summary/${projectId}`),

  // Generate summary from analysis
  generateSummary: (projectId: string) =>
    fetchApi<{ success: boolean; project_id: string; summary: L1Summary }>(
      `/api/l1-summary/${projectId}`,
      { method: 'POST' }
    ),

  // Get analysis status
  getStatus: (projectId: string) =>
    fetchApi<{
      has_analysis: boolean;
      analysis_chunks: number;
      has_summary: boolean;
      summary_quotes: number;
    }>(`/api/l1-status/${projectId}`),
};

// Writing result type
interface WritingResult {
  version_id: string;
  timestamp: string;
  text: string;
  citations: Citation[];
}

// Writing APIs
export const writingApi = {
  // Generate paragraph for a section
  generateParagraph: (
    projectId: string,
    sectionType: string,
    beneficiaryName?: string
  ) =>
    fetchApi<{
      success: boolean;
      section_type: string;
      paragraph: {
        text: string;
        citations: Citation[];
        section_type: string;
      };
    }>(`/api/l1-write/${projectId}?section_type=${sectionType}${beneficiaryName ? `&beneficiary_name=${encodeURIComponent(beneficiaryName)}` : ''}`, {
      method: 'POST',
    }),

  // Save manual writing result
  saveManual: (
    projectId: string,
    sectionType: string,
    paragraphText: string,
    citationsUsed: Citation[]
  ) =>
    fetchApi<{
      success: boolean;
      project_id: string;
      section_type: string;
      saved: {
        paragraph_length: number;
        citations_count: number;
      };
    }>(`/api/l1-write-manual/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({
        section_type: sectionType,
        paragraph_text: paragraphText,
        citations_used: citationsUsed,
      }),
    }),

  // Get all writing results for a project
  getAllWriting: (projectId: string) =>
    fetchApi<{
      project_id: string;
      sections: Record<string, WritingResult>;
      count: number;
    }>(`/api/l1-writing/${projectId}`),
};

// Model APIs
export const modelApi = {
  // Get available models
  getModels: () =>
    fetchApi<{
      models: { id: string; name: string; type: string }[];
      current: string;
    }>('/api/models'),

  // Set current model
  setModel: (modelId: string) =>
    fetchApi<{ success: boolean; current: string; message: string }>(
      `/api/models/${modelId}`,
      { method: 'POST' }
    ),
};

// Relationship graph types
interface RelationshipGraph {
  entities: Array<{
    id: string;
    type: string;
    name: string;
    documents: string[];
    attributes: Record<string, unknown>;
  }>;
  relations: Array<{
    source_id: string;
    target_id: string;
    relation_type: string;
    evidence: string[];
    description: string;
  }>;
  evidence_chains: Array<{
    claim: string;
    documents: string[];
    strength: string;
    reasoning: string;
  }>;
}

// Relationship Analysis APIs
export const relationshipApi = {
  // Analyze relationships across documents (auto mode)
  analyze: (projectId: string, beneficiaryName?: string) => {
    const params = beneficiaryName ? `?beneficiary_name=${encodeURIComponent(beneficiaryName)}` : '';
    return fetchApi<{
      success: boolean;
      project_id: string;
      graph: RelationshipGraph;
    }>(`/api/relationship/${projectId}${params}`, { method: 'POST' });
  },

  // Save manual relationship analysis
  saveManual: (projectId: string, data: RelationshipGraph) =>
    fetchApi<{
      success: boolean;
      project_id: string;
      version_id: string;
      saved: {
        entities: number;
        relations: number;
        evidence_chains: number;
      };
    }>(`/api/relationship-manual/${projectId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Get latest relationship analysis
  getLatest: (projectId: string) =>
    fetchApi<{
      version_id: string | null;
      data: RelationshipGraph | null;
    }>(`/api/projects/${projectId}/relationship`),
};

// Entity names type
export interface EntityNames {
  petitionerName: string;
  foreignEntityName: string;
  beneficiaryName: string;
}

// Project APIs
export const projectApi = {
  // Get project info
  getProject: (projectId: string) =>
    fetchApi<{
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string | null;
      beneficiaryName: string | null;
      petitionerName: string | null;
      foreignEntityName: string | null;
    }>(`/api/projects/${projectId}`),

  // Update project meta (beneficiary name, etc.)
  updateProject: (projectId: string, updates: { beneficiaryName?: string; petitionerName?: string; foreignEntityName?: string }) =>
    fetchApi<{
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string | null;
      beneficiaryName: string | null;
      petitionerName: string | null;
      foreignEntityName: string | null;
    }>(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
};

// Health check
export const healthApi = {
  check: () =>
    fetchApi<{
      status: string;
      ocr_provider: string;
      baidu_ocr: string;
      llm_provider: string;
      llm_model: string;
      available_models: string[];
      openai: string;
    }>('/api/health'),
};
