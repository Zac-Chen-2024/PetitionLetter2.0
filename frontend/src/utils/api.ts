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

  // Delete a single document
  deleteDocument: (documentId: string) =>
    fetchApi<{ success: boolean; message: string; document_id: string }>(
      `/api/document/${documentId}`,
      { method: 'DELETE' }
    ),

  // Delete multiple documents
  deleteDocumentsBatch: (projectId: string, documentIds: string[]) =>
    fetchApi<{
      success: boolean;
      deleted_count: number;
      total_requested: number;
      errors?: { document_id: string; error: string }[];
    }>(`/api/document/batch/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify(documentIds),
    }),
};

// OCR APIs - 手动触发 OCR（与上传解耦）
export const ocrApi = {
  // Trigger OCR for a single document
  triggerSingle: (documentId: string) =>
    fetchApi<{ success: boolean; message: string; document_id: string }>(
      `/api/ocr/${documentId}`,
      { method: 'POST' }
    ),

  // Trigger OCR for all pending documents in a project
  triggerBatch: (projectId: string) =>
    fetchApi<{
      success: boolean;
      message: string;
      total: number;
      batch_id: string | null;
    }>(`/api/ocr/batch/${projectId}`, { method: 'POST' }),

  // Get batch OCR status
  getBatchStatus: (batchId: string) =>
    fetchApi<{
      batch_id: string;
      project_id: string;
      total: number;
      completed: number;
      failed: number;
      processing: number;
      pending: number;
      progress_percent: number;
      started_at: string;
      finished_at: string | null;
      is_finished: boolean;
      documents: Record<string, { status: string; file_name: string; error?: string }>;
    }>(`/api/ocr/status/${batchId}`),

  // Get project OCR progress
  getProgress: (projectId: string) =>
    fetchApi<{
      project_id: string;
      total: number;
      pending: number;
      processing: number;
      completed: number;
      failed: number;
      progress_percent: number;
      documents: Array<{
        id: string;
        file_name: string;
        exhibit_number: string;
        ocr_status: string;
        page_count: number;
      }>;
    }>(`/api/ocr/progress/${projectId}`),
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

// Project type
export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string | null;
  beneficiaryName: string | null;
  petitionerName: string | null;
  foreignEntityName: string | null;
}

// Project APIs
export const projectApi = {
  // List all projects
  listProjects: () =>
    fetchApi<Project[]>('/api/projects'),

  // Create a new project
  createProject: (name: string) =>
    fetchApi<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  // Delete a project
  deleteProject: (projectId: string) =>
    fetchApi<{ success: boolean; message: string }>(`/api/projects/${projectId}`, {
      method: 'DELETE',
    }),

  // Get project info
  getProject: (projectId: string) =>
    fetchApi<Project>(`/api/projects/${projectId}`),

  // Update project meta (beneficiary name, etc.)
  updateProject: (projectId: string, updates: { beneficiaryName?: string; petitionerName?: string; foreignEntityName?: string }) =>
    fetchApi<Project>(`/api/projects/${projectId}`, {
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

// Style Template types
export interface StyleTemplate {
  id: string;
  section: string;
  name: string;
  original_text: string;
  parsed_structure: string;
  created_at: string;
  updated_at: string;
}

export interface ParsedStyleResult {
  structure_analysis: string;
  template: string;
  placeholders: Array<{
    name: string;
    description: string;
    example: string;
  }>;
}

// Highlight types
export interface HighlightItem {
  id: string;
  text_content: string | null;
  category: string | null;
  category_cn: string | null;
  importance: string | null;
  reason: string | null;
  page_number: number;
  bbox: {
    x1: number | null;
    y1: number | null;
    x2: number | null;
    y2: number | null;
  } | null;
  source_block_ids: string[];
}

export interface DocumentHighlightInfo {
  id: string;
  file_name: string;
  exhibit_number: string | null;
  ocr_status: string;
  highlight_status: string | null;
  page_count: number;
}

// Highlight APIs
export const highlightApi = {
  // Trigger highlight analysis for a document
  trigger: (documentId: string) =>
    fetchApi<{
      success: boolean;
      message: string;
      document_id: string;
      status: string;
    }>(`/api/highlight/${documentId}`, { method: 'POST' }),

  // Trigger batch highlight for a project
  triggerBatch: (projectId: string) =>
    fetchApi<{
      success: boolean;
      message: string;
      total: number;
      documents: { id: string; file_name: string }[];
    }>(`/api/highlight/batch/${projectId}`, { method: 'POST' }),

  // Get highlights for a document
  getHighlights: (documentId: string, page?: number) => {
    const params = page ? `?page=${page}` : '';
    return fetchApi<{
      document_id: string;
      file_name: string;
      highlight_status: string | null;
      total_highlights: number;
      highlights: HighlightItem[];
    }>(`/api/highlight/${documentId}${params}`);
  },

  // Get highlights grouped by page
  getHighlightsByPage: (documentId: string) =>
    fetchApi<{
      document_id: string;
      file_name: string;
      highlight_status: string | null;
      page_count: number;
      highlights_by_page: Record<number, HighlightItem[]>;
    }>(`/api/highlight/by-page/${documentId}`),

  // Get highlight status for a document
  getStatus: (documentId: string) =>
    fetchApi<{
      document_id: string;
      highlight_status: string | null;
      highlight_count: number;
      ocr_status: string;
      has_text_blocks: boolean;
    }>(`/api/highlight/status/${documentId}`),

  // Get project highlight progress
  getProgress: (projectId: string) =>
    fetchApi<{
      project_id: string;
      total: number;
      not_started: number;
      pending: number;
      processing: number;
      completed: number;
      failed: number;
      progress_percent: number;
      documents: DocumentHighlightInfo[];
    }>(`/api/highlight/progress/${projectId}`),

  // Get document page as image
  getPageImage: (documentId: string, pageNumber: number, dpi?: number) => {
    const params = dpi ? `?dpi=${dpi}` : '';
    return `${API_BASE}/api/highlight/page/${documentId}/${pageNumber}/image${params}`;
  },

  // Save highlighted image
  saveImage: (documentId: string, pageNumber: number, imageBase64: string) =>
    fetchApi<{
      success: boolean;
      document_id: string;
      page_number: number;
      url: string;
    }>(`/api/highlight/${documentId}/save`, {
      method: 'POST',
      body: JSON.stringify({
        page_number: pageNumber,
        image_base64: imageBase64,
      }),
    }),

  // Get saved highlight images
  getSavedImages: (documentId: string) =>
    fetchApi<{
      document_id: string;
      image_urls: Record<string, string>;
      total_saved: number;
    }>(`/api/highlight/${documentId}/saved-images`),
};

// Style Template APIs
export const styleTemplateApi = {
  // Parse sample text to extract structure
  parse: (section: string, sampleText: string) =>
    fetchApi<{
      success: boolean;
      section: string;
      parsed: ParsedStyleResult;
    }>('/api/style-templates/parse', {
      method: 'POST',
      body: JSON.stringify({
        section,
        sample_text: sampleText,
      }),
    }),

  // Save a new style template
  create: (data: {
    section: string;
    name: string;
    original_text: string;
    parsed_structure: string;
  }) =>
    fetchApi<{
      success: boolean;
      template: StyleTemplate;
    }>('/api/style-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Get all templates (optionally filtered by section)
  list: (section?: string) => {
    const params = section ? `?section=${section}` : '';
    return fetchApi<{
      templates: StyleTemplate[];
      count: number;
    }>(`/api/style-templates${params}`);
  },

  // Get a single template by ID
  get: (templateId: string) =>
    fetchApi<StyleTemplate>(`/api/style-templates/${templateId}`),

  // Update a template
  update: (templateId: string, data: { name?: string; parsed_structure?: string }) =>
    fetchApi<{
      success: boolean;
      template: StyleTemplate;
    }>(`/api/style-templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete a template
  delete: (templateId: string) =>
    fetchApi<{
      success: boolean;
      deleted: string;
    }>(`/api/style-templates/${templateId}`, {
      method: 'DELETE',
    }),
};

