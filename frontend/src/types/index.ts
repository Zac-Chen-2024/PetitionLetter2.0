// Document types
export interface Document {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_size?: number;
  page_count: number;
  ocr_text?: string;
  ocr_status: 'pending' | 'processing' | 'completed' | 'failed';
  exhibit_number?: string;
  exhibit_title?: string;
  created_at: string;
  // Analysis status
  analysis_status?: 'not_analyzed' | 'analyzed';
}

// L-1 Standards
export type L1StandardKey =
  | 'qualifying_relationship'
  | 'qualifying_employment'
  | 'qualifying_capacity'
  | 'doing_business';

export interface L1Standard {
  chinese: string;
  english: string;
  description: string;
  keywords: string[];
}

export const L1_STANDARDS: Record<L1StandardKey, L1Standard> = {
  qualifying_relationship: {
    chinese: "合格的公司关系",
    english: "Qualifying Corporate Relationship",
    description: "美国公司与海外公司必须是母/子/分/关联公司关系",
    keywords: ["母公司", "子公司", "关联公司", "分公司", "所有权", "股权", "持股", "控股", "共同控制"]
  },
  qualifying_employment: {
    chinese: "海外合格任职",
    english: "Qualifying Employment Abroad",
    description: "受益人过去3年中在海外关联公司连续工作至少1年",
    keywords: ["任职", "工作", "职位", "入职", "离职", "任期", "年限", "海外", "境外"]
  },
  qualifying_capacity: {
    chinese: "合格的职位性质",
    english: "Qualifying Capacity",
    description: "L-1A: 高管/经理; L-1B: 专业知识人员",
    keywords: ["高管", "经理", "管理", "决策", "战略", "专业知识", "专有技术", "指导", "监督", "人事权", "预算"]
  },
  doing_business: {
    chinese: "持续运营",
    english: "Doing Business",
    description: "美国和海外公司都必须持续、积极运营",
    keywords: ["收入", "利润", "员工", "雇员", "银行", "存款", "合同", "业务", "办公", "注册"]
  }
};

// Quote/Evidence types
export interface QuoteSource {
  exhibit_id: string;
  file_name: string;
}

export interface Quote {
  standard: string;
  standard_key: L1StandardKey;
  standard_en: string;
  quote: string;
  relevance: string;
  page?: number;
  source: QuoteSource;
}

export interface DocumentAnalysis {
  document_id: string;
  exhibit_id: string;
  file_name: string;
  quotes: Quote[];
}

// Analysis results grouped by standard
export interface AnalysisByStandard {
  [key: string]: Quote[];
}

export interface L1Summary {
  project_id: string;
  total_quotes: number;
  by_standard: AnalysisByStandard;
  generated_at: string;
}

// Paragraph generation
export interface ParagraphVersion {
  id: string;
  version: number;
  text: string;
  citations: Citation[];
  created_at: string;
  revision_instruction?: string;
}

export interface Citation {
  exhibit: string;
  file_name: string;
  quote: string;
  claim: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
