import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { FocusState, Connection, ElementPosition, Snippet, ViewMode, ArgumentViewMode, SelectionState, BoundingBox, Argument, SubArgument, WritingEdge, LetterSection, Position, ArgumentClaimType, ArgumentStatus, LLMProvider, PageType, WorkMode } from '../types';
import { legalStandards } from '../data/legalStandards';
import { getMaterialTypeColor, STANDARD_KEY_TO_ID } from '../constants/colors';
import { apiClient } from '../services/api';

// Pipeline Stage Types
export type PipelineStage =
  | 'ocr_complete'      // Stage 1: Only OCR results available
  | 'extracting'        // Extracting snippets
  | 'snippets_ready'    // Stage 2: Snippets extracted, awaiting confirmation
  | 'confirming'        // Confirming mappings
  | 'mapping_confirmed' // Stage 3: Mappings confirmed, can generate
  | 'generating'        // Generating petition
  | 'petition_ready';   // Stage 4: Petition generated

export interface PipelineState {
  stage: PipelineStage;
  progress?: number;           // 0-100 for extracting/generating
  snippetCount?: number;       // Number of extracted snippets
  confirmedMappings?: number;  // Number of confirmed mappings
  error?: string;
}

// Backend snippet format (no standard_key - classification at Argument level)
interface BackendSnippet {
  snippet_id: string;
  document_id: string;
  exhibit_id: string;
  text: string;
  page: number;
  bbox: { x1: number; y1: number; x2: number; y2: number } | null;
  block_type?: string;
}

// New unified extraction format (with subject attribution)
interface UnifiedSnippet {
  snippet_id: string;  // Full ID: snp_A1_p2_p2_b3_xxxxx
  block_id: string;    // Short ID: p2_b3
  exhibit_id: string;
  text: string;
  subject: string;
  subject_role: string;
  is_applicant_achievement: boolean;
  evidence_type: string;
  confidence: number;
  reasoning: string;
  page?: number;
  bbox?: { x1: number; y1: number; x2: number; y2: number } | null;
}

// Merge suggestion format
export interface MergeSuggestion {
  id: string;
  primary_entity_name: string;
  primary_entity_type: string;
  merge_entity_names: string[];
  reason: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected';
}

// Default color for unassigned snippets
const DEFAULT_SNIPPET_COLOR = '#94a3b8';  // slate-400

// Convert backend snippet to frontend format
// Color is now determined by the Argument it belongs to (handled in EvidenceCardPool)
function convertBackendSnippet(bs: BackendSnippet): Snippet {
  return {
    id: bs.snippet_id,
    documentId: bs.document_id || `doc_${bs.exhibit_id}`,
    content: bs.text,
    summary: bs.text.substring(0, 80) + (bs.text.length > 80 ? '...' : ''),
    boundingBox: bs.bbox ? {
      x: bs.bbox.x1,
      y: bs.bbox.y1,
      width: bs.bbox.x2 - bs.bbox.x1,
      height: bs.bbox.y2 - bs.bbox.y1,
      page: bs.page,
    } : { x: 0, y: 0, width: 100, height: 50, page: bs.page },
    materialType: 'other',  // No pre-classification
    color: DEFAULT_SNIPPET_COLOR,  // Gray by default, updated based on Argument
    exhibitId: bs.exhibit_id,
    page: bs.page,
  };
}

// Convert unified extraction snippet to frontend format
function convertUnifiedSnippet(us: UnifiedSnippet): Snippet {
  return {
    id: us.snippet_id,  // Use full snippet_id to match argument.snippet_ids
    documentId: `doc_${us.exhibit_id}`,
    content: us.text,
    summary: us.text.substring(0, 80) + (us.text.length > 80 ? '...' : ''),
    boundingBox: us.bbox ? {
      x: us.bbox.x1,
      y: us.bbox.y1,
      width: us.bbox.x2 - us.bbox.x1,
      height: us.bbox.y2 - us.bbox.y1,
      page: us.page || 1,
    } : { x: 0, y: 0, width: 100, height: 50, page: us.page || 1 },
    materialType: 'other',
    color: DEFAULT_SNIPPET_COLOR,
    exhibitId: us.exhibit_id,
    page: us.page || 1,
    // New unified extraction fields
    subject: us.subject,
    subjectRole: us.subject_role,
    isApplicantAchievement: us.is_applicant_achievement,
    evidenceType: us.evidence_type,
  };
}

// Panel bounds for clipping connection lines
interface PanelBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface AppContextType {
  // Project state
  projectId: string;
  setProjectId: (id: string) => void;
  isLoading: boolean;
  loadError: string | null;

  // AI Argument Generation
  isGeneratingArguments: boolean;
  generateArguments: (forceReanalyze?: boolean, applicantName?: string) => Promise<void>;
  generatedMainSubject: string | null;

  // Data
  connections: Connection[];
  allSnippets: Snippet[];

  // Focus state (for filtering - Argument/Standard level)
  focusState: FocusState;
  setFocusState: (state: FocusState) => void;
  clearFocus: () => void;

  // Selected snippet (for PDF highlight - independent of focusState)
  selectedSnippetId: string | null;
  setSelectedSnippetId: (id: string | null) => void;

  // Selected document for viewer
  selectedDocumentId: string;
  setSelectedDocumentId: (id: string) => void;

  // Connection management
  addConnection: (snippetId: string, standardId: string, isConfirmed: boolean) => void;
  removeConnection: (connectionId: string) => void;
  confirmConnection: (connectionId: string) => void;

  // Drag state
  draggedSnippetId: string | null;
  setDraggedSnippetId: (id: string | null) => void;

  // Element positions for SVG lines
  snippetPositions: Map<string, ElementPosition>;
  pdfBboxPositions: Map<string, ElementPosition>;
  updateSnippetPosition: (id: string, position: ElementPosition) => void;
  updatePdfBboxPosition: (id: string, position: ElementPosition) => void;

  // Panel bounds for clipping
  snippetPanelBounds: PanelBounds | null;
  setSnippetPanelBounds: (bounds: PanelBounds | null) => void;

  // View mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Argument view mode (list vs graph)
  argumentViewMode: ArgumentViewMode;
  setArgumentViewMode: (mode: ArgumentViewMode) => void;

  // Argument graph node positions (for graph view)
  argumentGraphPositions: Map<string, Position>;
  updateArgumentGraphPosition: (id: string, position: Position) => void;
  clearArgumentGraphPositions: () => void;

  // Snippet management
  addSnippet: (snippet: Omit<Snippet, 'id'>) => void;
  removeSnippet: (snippetId: string) => void;

  // Selection state for creating snippets
  selectionState: SelectionState;
  setSelectionState: (state: SelectionState) => void;
  startSelection: (documentId: string, pageNumber: number, point: { x: number; y: number }) => void;
  updateSelection: (point: { x: number; y: number }) => void;
  endSelection: () => { boundingBox: BoundingBox; documentId: string } | null;
  cancelSelection: () => void;

  // Helpers
  getConnectionsForSnippet: (snippetId: string) => Connection[];
  getConnectionsForStandard: (standardId: string) => Connection[];
  isElementHighlighted: (elementType: 'snippet' | 'standard', elementId: string) => boolean;

  // ============================================
  // Argument Assembly State (NEW)
  // ============================================

  // Arguments for assembly (main page)
  arguments: Argument[];
  addArgument: (argument: Omit<Argument, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateArgument: (id: string, updates: Partial<Omit<Argument, 'id' | 'createdAt'>>) => void;
  removeArgument: (id: string) => void;
  updateArgumentPosition: (id: string, position: Position) => void;

  // Snippet to Argument operations
  addSnippetToArgument: (argumentId: string, snippetId: string) => void;
  removeSnippetFromArgument: (argumentId: string, snippetId: string) => void;

  // Argument → Standard mappings (replaces snippet → standard connections)
  argumentMappings: WritingEdge[];  // argument-to-standard edges
  addArgumentMapping: (argumentId: string, standardKey: string) => void;
  removeArgumentMapping: (edgeId: string) => void;

  // Argument drag state
  draggedArgumentId: string | null;
  setDraggedArgumentId: (id: string | null) => void;

  // Argument positions for connection lines
  argumentPositions: Map<string, ElementPosition>;
  updateArgumentPosition2: (id: string, position: ElementPosition) => void;

  // SubArgument positions for connection lines
  subArgumentPositions: Map<string, ElementPosition>;
  updateSubArgumentPosition: (id: string, position: ElementPosition) => void;

  // Hover state for snippet linking hints
  hoveredSnippetId: string | null;
  setHoveredSnippetId: (id: string | null) => void;

  // ============================================
  // SubArgument State (次级子论点)
  // ============================================
  subArguments: SubArgument[];
  addSubArgument: (subArgument: Omit<SubArgument, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSubArgument: (id: string, updates: Partial<Omit<SubArgument, 'id' | 'createdAt'>>) => void;
  removeSubArgument: (id: string) => void;

  // ============================================
  // Writing Canvas State (kept for step 2)
  // ============================================

  // Writing edges (connections in writing canvas)
  writingEdges: WritingEdge[];
  addWritingEdge: (source: string, target: string, type: WritingEdge['type']) => void;
  removeWritingEdge: (id: string) => void;
  confirmWritingEdge: (id: string) => void;

  // Letter sections
  letterSections: LetterSection[];
  updateLetterSection: (id: string, content: string) => void;

  // Node positions in writing canvas (for snippets and standards)
  writingNodePositions: Map<string, Position>;
  updateWritingNodePosition: (id: string, position: Position) => void;

  // ============================================
  // Pipeline State
  // ============================================
  pipelineState: PipelineState;
  extractSnippets: () => Promise<void>;
  confirmAllMappings: () => Promise<void>;
  generatePetition: () => Promise<void>;
  reloadSnippets: () => Promise<void>;
  canExtract: boolean;
  canConfirm: boolean;
  canGenerate: boolean;

  // ============================================
  // Unified Extraction State (NEW)
  // ============================================
  unifiedExtract: (applicantName: string) => Promise<void>;
  generateMergeSuggestions: (applicantName: string) => Promise<MergeSuggestion[]>;
  confirmMerges: (confirmations: Array<{suggestion_id: string; status: string}>) => Promise<void>;
  applyMerges: () => Promise<void>;
  mergeSuggestions: MergeSuggestion[];
  loadMergeSuggestions: () => Promise<void>;
  isExtracting: boolean;
  isMerging: boolean;
  extractionProgress: { current: number; total: number; currentExhibit?: string } | null;

  // ============================================
  // LLM Provider Settings
  // ============================================
  llmProvider: LLMProvider;
  setLlmProvider: (provider: LLMProvider) => void;

  // ============================================
  // Page Navigation
  // ============================================
  currentPage: PageType;
  setCurrentPage: (page: PageType) => void;

  // ============================================
  // Work Mode (Verify vs Write)
  // ============================================
  workMode: WorkMode;
  setWorkMode: (mode: WorkMode) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY_SNIPPETS = 'evidence-system-snippets';
const STORAGE_KEY_CONNECTIONS = 'evidence-system-connections';
const STORAGE_KEY_VIEW_MODE = 'evidence-system-view-mode';
const STORAGE_KEY_ARGUMENTS = 'evidence-system-arguments';
const STORAGE_KEY_WRITING_EDGES = 'evidence-system-writing-edges';
const STORAGE_KEY_LETTER_SECTIONS = 'evidence-system-letter-sections';
const STORAGE_KEY_WRITING_NODE_POSITIONS = 'evidence-system-writing-node-positions';
const STORAGE_KEY_LLM_PROVIDER = 'evidence-system-llm-provider';
const STORAGE_KEY_ARGUMENT_VIEW_MODE = 'evidence-system-argument-view-mode';
const STORAGE_KEY_ARGUMENT_GRAPH_POSITIONS = 'evidence-system-argument-graph-positions';
const STORAGE_KEY_SUB_ARGUMENTS = 'evidence-system-sub-arguments';

// Initial arguments - empty, will be created via ArgumentAssembly panel
const initialArguments: Argument[] = [];

// Initial writing edges - empty, will be created via drag and drop
const initialWritingEdges: WritingEdge[] = [];

// Initial letter sections - V3 format with SubArgument provenance (4 standards)
// Auto-generated from backend/generated_sections.json
const initialLetterSections: LetterSection[] = JSON.parse(`[{"id":"section-membership","title":"Membership","standardId":"membership","content":"Ms. Qu satisfies the criterion for membership in associations in the field of endeavor that require outstanding achievements of their members, as evidenced by her selective admission to the prestigious Shanghai Fitness Bodybuilding Association. Ms. Qu's membership was granted only after a formal application and review process, as detailed in the Association's implementation guidelines [Exhibit C2, p.2]. This membership is reserved for senior professionals who have devoted many years to their specialty, and her admission was personally reviewed and certified by the Association's Vice President and other top experts [Exhibit C2, p.3]. The Association is a significant industry body that provides critical services to its members, including market information, technology consultation, and legal aid [Exhibit C4, p.2]. It holds substantial authority, as it formulates industry quality specifications, service standards, and participates in product standard development, demonstrating its role in setting professional benchmarks [Exhibit C4, p.3]. Its formal governance structure, including a Council elected through a re-election meeting, further underscores its established and authoritative status within the field [Exhibit C5, p.2]. The Association's leadership includes individuals of the highest caliber, such as Ping Zhang, a champion athlete widely recognized for winning the first gold medal for China in the Asian Bodybuilding and Fitness Championships and for holding the most gold medals [Exhibit C6, p.2]. Therefore, Ms. Qu's membership in this selective, authoritative, and elite organization, which admits only those with demonstrated senior-level accomplishments, clearly meets the regulatory standard for associations requiring outstanding achievements of their members.","isGenerated":true,"order":0,"sentences":[{"text":"Ms. Qu satisfies the criterion for membership in associations in the field of endeavor that require outstanding achievements of their members, as evidenced by her selective admission to the prestigious Shanghai Fitness Bodybuilding Association.","snippet_ids":[],"subargument_id":null,"argument_id":"arg-001","exhibit_refs":[],"sentence_type":"opening"},{"text":"Ms. Qu's membership was granted only after a formal application and review process, as detailed in the Association's implementation guidelines [Exhibit C2, p.2].","snippet_ids":["snip_e983ce38"],"subargument_id":"subarg-7308a09f","argument_id":"arg-001","exhibit_refs":["C2-2"],"sentence_type":"body"},{"text":"This membership is reserved for senior professionals who have devoted many years to their specialty, and her admission was personally reviewed and certified by the Association's Vice President and other top experts [Exhibit C2, p.3].","snippet_ids":["snip_356aa20e","snip_356f5344"],"subargument_id":"subarg-7308a09f","argument_id":"arg-001","exhibit_refs":["C2-3"],"sentence_type":"body"},{"text":"The Association is a significant industry body that provides critical services to its members, including market information, technology consultation, and legal aid [Exhibit C4, p.2].","snippet_ids":["snip_5361adec"],"subargument_id":"subarg-058fb8ea","argument_id":"arg-001","exhibit_refs":["C4-2"],"sentence_type":"body"},{"text":"It holds substantial authority, as it formulates industry quality specifications, service standards, and participates in product standard development, demonstrating its role in setting professional benchmarks [Exhibit C4, p.3].","snippet_ids":["snip_b2e54f44"],"subargument_id":"subarg-058fb8ea","argument_id":"arg-001","exhibit_refs":["C4-3"],"sentence_type":"body"},{"text":"Its formal governance structure, including a Council elected through a re-election meeting, further underscores its established and authoritative status within the field [Exhibit C5, p.2].","snippet_ids":["snip_d7c723ab"],"subargument_id":"subarg-058fb8ea","argument_id":"arg-001","exhibit_refs":["C5-2"],"sentence_type":"body"},{"text":"The Association's leadership includes individuals of the highest caliber, such as Ping Zhang, a champion athlete widely recognized for winning the first gold medal for China in the Asian Bodybuilding and Fitness Championships and for holding the most gold medals [Exhibit C6, p.2].","snippet_ids":["snip_d3d1a25d"],"subargument_id":"subarg-14536b07","argument_id":"arg-001","exhibit_refs":["C6-2"],"sentence_type":"body"},{"text":"Therefore, Ms. Qu's membership in this selective, authoritative, and elite organization, which admits only those with demonstrated senior-level accomplishments, clearly meets the regulatory standard for associations requiring outstanding achievements of their members.","snippet_ids":[],"subargument_id":null,"argument_id":"arg-001","exhibit_refs":[],"sentence_type":"closing"}],"provenanceIndex":{"bySubArgument":{"subarg-7308a09f":[1,2],"subarg-058fb8ea":[3,4,5],"subarg-14536b07":[6]},"byArgument":{"arg-001":[0,1,2,3,4,5,6,7]},"bySnippet":{"snip_e983ce38":[1],"snip_356aa20e":[2],"snip_356f5344":[2],"snip_5361adec":[3],"snip_b2e54f44":[4],"snip_d7c723ab":[5],"snip_d3d1a25d":[6]}}},{"id":"section-published_material","title":"Published Material","standardId":"published_material","content":"The Beneficiary's work has been the subject of major media coverage in publications of national and international circulation, as demonstrated by extensive features in The Jakarta Post, The Paper (澎湃新闻), and China Sports Daily (中国体育报). The Jakarta Post represents a major media institution in Indonesia, founded in 1983 as a unique milestone in the nation's media publishing history [Exhibit D2, p.2]. It was established as a daily English-language newspaper headquartered in Jakarta, owned by PT Bina Media Tenggara [Exhibit D3, p.4]. The publication's journalistic excellence is confirmed by its receipt of prestigious awards, including the Adam Malik award, which its journalists have won multiple times. Specifically, The Jakarta Post earned top honors for its investigative report on unrest in Wamena, Papua, in September 2019, along with a bronze award for its print edition coverage of the 2019 presidential election [Exhibit D4, p.5]. The Paper (澎湃新闻) holds significant media authority as a digital publication overseen by the Chinese Communist Party, distinguishing it from other new media challengers [Exhibit D12, p.2]. It possesses Class I Qualification for Internet News Information Service and Audio Video Service, representing China's first product to undergo complete transformation from traditional to new media [Exhibit D13, p.2]. The Paper's excellence is further evidenced by its receipt of over 400 domestic and international awards and honors from 2018 to 2023, including the China Journalism Award and SND Best of Digital Design. As a new media success story, The Paper covers contentious issues including official corruption and public health scandals, demonstrating its influence in China's fast-changing news marketplace [Exhibit D12, p.2]. Its coverage includes substantive interviews with industry figures such as Qu Yaruo, founder of Venus Weightlifting Club, discussing China's Olympic weightlifting prowess [Exhibit D9, p.3]. China Sports Daily (中国体育报) enjoys national recognition and prestige, having been named multiple times among the \\"Top Ten Most Beloved Newspapers\\" and \\"Top Ten Influential Media Brands in China\\" in national selection activities [Exhibit D6, p.3]. The publication maintains official status and substantial circulation reach, having survived major reforms in the 1990s that expanded China's sports journal market from a few publications to more than forty [Exhibit D7, p.2]. China Sports Daily's editorial mission is to provide comprehensive, multidimensional coverage of Chinese and global sports through timely, authoritative, vivid, and rich news reports [Exhibit D6, p.3]. Collectively, this evidence establishes that the Beneficiary's work has been featured in major media with national and international circulation, thereby satisfying the regulatory criterion at 8 C.F.R. §204.5(h)(3)(iii).","isGenerated":true,"order":1,"sentences":[{"text":"The Beneficiary's work has been the subject of major media coverage in publications of national and international circulation, as demonstrated by extensive features in The Jakarta Post, The Paper (澎湃新闻), and China Sports Daily (中国体育报).","snippet_ids":[],"subargument_id":null,"argument_id":"arg-002","exhibit_refs":[],"sentence_type":"opening"},{"text":"The Jakarta Post represents a major media institution in Indonesia, founded in 1983 as a unique milestone in the nation's media publishing history [Exhibit D2, p.2].","snippet_ids":["snip_feabcea2"],"subargument_id":"subarg-8d2b73fb","argument_id":"arg-002","exhibit_refs":["D2-2"],"sentence_type":"body"},{"text":"It was established as a daily English-language newspaper headquartered in Jakarta, owned by PT Bina Media Tenggara [Exhibit D3, p.4].","snippet_ids":["snip_2a42f189"],"subargument_id":"subarg-8d2b73fb","argument_id":"arg-002","exhibit_refs":["D3-4"],"sentence_type":"body"},{"text":"The publication's journalistic excellence is confirmed by its receipt of prestigious awards, including the Adam Malik award, which its journalists have won multiple times.","snippet_ids":[],"subargument_id":"subarg-606c45d0","argument_id":"arg-002","exhibit_refs":[],"sentence_type":"body"},{"text":"Specifically, The Jakarta Post earned top honors for its investigative report on unrest in Wamena, Papua, in September 2019, along with a bronze award for its print edition coverage of the 2019 presidential election [Exhibit D4, p.5].","snippet_ids":["snip_f354cd60"],"subargument_id":"subarg-606c45d0","argument_id":"arg-002","exhibit_refs":["D4-5"],"sentence_type":"body"},{"text":"The Paper (澎湃新闻) holds significant media authority as a digital publication overseen by the Chinese Communist Party, distinguishing it from other new media challengers [Exhibit D12, p.2].","snippet_ids":["snip_7b495f59"],"subargument_id":"subarg-26a4dc6c","argument_id":"arg-002","exhibit_refs":["D12-2"],"sentence_type":"body"},{"text":"It possesses Class I Qualification for Internet News Information Service and Audio Video Service, representing China's first product to undergo complete transformation from traditional to new media [Exhibit D13, p.2].","snippet_ids":["snip_f27ffee1"],"subargument_id":"subarg-26a4dc6c","argument_id":"arg-002","exhibit_refs":["D13-2"],"sentence_type":"body"},{"text":"The Paper's excellence is further evidenced by its receipt of over 400 domestic and international awards and honors from 2018 to 2023, including the China Journalism Award and SND Best of Digital Design.","snippet_ids":[],"subargument_id":"subarg-951aa4ac","argument_id":"arg-002","exhibit_refs":[],"sentence_type":"body"},{"text":"As a new media success story, The Paper covers contentious issues including official corruption and public health scandals, demonstrating its influence in China's fast-changing news marketplace [Exhibit D12, p.2].","snippet_ids":["snip_984945de"],"subargument_id":"subarg-69e6fe87","argument_id":"arg-002","exhibit_refs":["D12-2"],"sentence_type":"body"},{"text":"Its coverage includes substantive interviews with industry figures such as Qu Yaruo, founder of Venus Weightlifting Club, discussing China's Olympic weightlifting prowess [Exhibit D9, p.3].","snippet_ids":["snip_50895df3"],"subargument_id":"subarg-69e6fe87","argument_id":"arg-002","exhibit_refs":["D9-3"],"sentence_type":"body"},{"text":"China Sports Daily (中国体育报) enjoys national recognition and prestige, having been named multiple times among the \\"Top Ten Most Beloved Newspapers\\" and \\"Top Ten Influential Media Brands in China\\" in national selection activities [Exhibit D6, p.3].","snippet_ids":["snip_4a4214d1"],"subargument_id":"subarg-d4198431","argument_id":"arg-002","exhibit_refs":["D6-3"],"sentence_type":"body"},{"text":"The publication maintains official status and substantial circulation reach, having survived major reforms in the 1990s that expanded China's sports journal market from a few publications to more than forty [Exhibit D7, p.2].","snippet_ids":["snip_af5f7a3a"],"subargument_id":"subarg-173687f6","argument_id":"arg-002","exhibit_refs":["D7-2"],"sentence_type":"body"},{"text":"China Sports Daily's editorial mission is to provide comprehensive, multidimensional coverage of Chinese and global sports through timely, authoritative, vivid, and rich news reports [Exhibit D6, p.3].","snippet_ids":["snip_94d0e914"],"subargument_id":"subarg-9fa38db4","argument_id":"arg-002","exhibit_refs":["D6-3"],"sentence_type":"body"},{"text":"Collectively, this evidence establishes that the Beneficiary's work has been featured in major media with national and international circulation, thereby satisfying the regulatory criterion at 8 C.F.R. §204.5(h)(3)(iii).","snippet_ids":[],"subargument_id":null,"argument_id":"arg-002","exhibit_refs":[],"sentence_type":"closing"}],"provenanceIndex":{"bySubArgument":{"subarg-8d2b73fb":[1,2],"subarg-606c45d0":[3,4],"subarg-26a4dc6c":[5,6],"subarg-951aa4ac":[7],"subarg-69e6fe87":[8,9],"subarg-d4198431":[10],"subarg-173687f6":[11],"subarg-9fa38db4":[12]},"byArgument":{"arg-002":[0,1,2,3,4,5,6,7,8,9,10,11,12,13]},"bySnippet":{"snip_feabcea2":[1],"snip_2a42f189":[2],"snip_f354cd60":[4],"snip_7b495f59":[5],"snip_f27ffee1":[6],"snip_984945de":[8],"snip_50895df3":[9],"snip_4a4214d1":[10],"snip_af5f7a3a":[11],"snip_94d0e914":[12]}}},{"id":"section-original_contributions","title":"Original Contributions","standardId":"original_contributions","content":"The Beneficiary has made original contributions of major significance in the field of Olympic weightlifting through the creation of innovative training methodologies and the establishment of foundational infrastructure for amateur participation in China. The Beneficiary originated the Body Alignment Training (BAT) system, an innovative methodology that integrates posture correction, sports rehabilitation, and strength training, as recognized in her professional profile [Exhibit A1, p.2]. This system, which reflects a deep concern for athlete health and incorporates innovative methods for body alignment and injury prevention, has proven effective, as demonstrated by its application in reducing knee injuries among athletes [Exhibit B3, p.2; Exhibit B5, p.3]. The major significance of these contributions is evidenced by their international reach and endorsement by elite figures in the sport, including the training of Olympic medalists and the delivery of her system in over 50 countries [Exhibit A1, p.2; Exhibit B1, p.2]. Her holistic approach, guided by the philosophy \\"Human before athlete,\\" has had a profound impact worldwide and earned recommendations from Olympic champions and federation presidents [Exhibit B2, p.3; Exhibit B3, p.2]. The Beneficiary pioneered the amateur weightlifting movement in China by founding the nation's first amateur Olympic weightlifting club, which successfully filled a critical gap in the domestic sports landscape [Exhibit B4, p.2]. This club organizes the high-level ALL Stars Weightlifting competition, an event recognized for reaching international standards in scale and professionalism, thereby popularizing the sport at the grassroots level [Exhibit B3, p.2; Exhibit B4, p.3]. Her contributions extend to systemic industry development, including supporting international federations, securing major brand sponsorships, and identifying and nurturing promising young athletes [Exhibit B2, p.2]. Furthermore, her training system has directly propelled more than 20 students to win medals in global competitions, with a significant number transitioning to professional careers [Exhibit B4, p.3]. Collectively, the Beneficiary's creation of a novel training system, its validation through elite athletic success, and her foundational role in democratizing the sport in China constitute original contributions of major significance to the field of Olympic weightlifting.","isGenerated":true,"order":2,"sentences":[{"text":"The Beneficiary has made original contributions of major significance in the field of Olympic weightlifting through the creation of innovative training methodologies and the establishment of foundational infrastructure for amateur participation in China.","snippet_ids":[],"subargument_id":null,"argument_id":"arg-005","exhibit_refs":[],"sentence_type":"opening"},{"text":"The Beneficiary originated the Body Alignment Training (BAT) system, an innovative methodology that integrates posture correction, sports rehabilitation, and strength training, as recognized in her professional profile [Exhibit A1, p.2].","snippet_ids":["snip_0b4a8714"],"subargument_id":"subarg-74492d8f","argument_id":"arg-005","exhibit_refs":["A1-2"],"sentence_type":"body"},{"text":"This system, which reflects a deep concern for athlete health and incorporates innovative methods for body alignment and injury prevention, has proven effective, as demonstrated by its application in reducing knee injuries among athletes [Exhibit B3, p.2; Exhibit B5, p.3].","snippet_ids":["snip_962697e3","snip_42ff06d0"],"subargument_id":"subarg-74492d8f","argument_id":"arg-005","exhibit_refs":["B3-2","B5-3"],"sentence_type":"body"},{"text":"The major significance of these contributions is evidenced by their international reach and endorsement by elite figures in the sport, including the training of Olympic medalists and the delivery of her system in over 50 countries [Exhibit A1, p.2; Exhibit B1, p.2].","snippet_ids":["snip_d433b0ca","snip_fe6210e8"],"subargument_id":"subarg-3f5da824","argument_id":"arg-005","exhibit_refs":["A1-2","B1-2"],"sentence_type":"body"},{"text":"Her holistic approach, guided by the philosophy \\"Human before athlete,\\" has had a profound impact worldwide and earned recommendations from Olympic champions and federation presidents [Exhibit B2, p.3; Exhibit B3, p.2].","snippet_ids":["snip_1523f22d","snip_68b58eb4"],"subargument_id":"subarg-3f5da824","argument_id":"arg-005","exhibit_refs":["B2-3","B3-2"],"sentence_type":"body"},{"text":"The Beneficiary pioneered the amateur weightlifting movement in China by founding the nation's first amateur Olympic weightlifting club, which successfully filled a critical gap in the domestic sports landscape [Exhibit B4, p.2].","snippet_ids":["snip_ca5c82db"],"subargument_id":"subarg-af04653a","argument_id":"arg-005","exhibit_refs":["B4-2"],"sentence_type":"body"},{"text":"This club organizes the high-level ALL Stars Weightlifting competition, an event recognized for reaching international standards in scale and professionalism, thereby popularizing the sport at the grassroots level [Exhibit B3, p.2; Exhibit B4, p.3].","snippet_ids":["snip_b33bccda","snip_610f8046"],"subargument_id":"subarg-af04653a","argument_id":"arg-005","exhibit_refs":["B3-2","B4-3"],"sentence_type":"body"},{"text":"Her contributions extend to systemic industry development, including supporting international federations, securing major brand sponsorships, and identifying and nurturing promising young athletes [Exhibit B2, p.2].","snippet_ids":["snip_03bf57c5","snip_31433df1","snip_cc97a242"],"subargument_id":"subarg-18ae28ea","argument_id":"arg-005","exhibit_refs":["B2-2"],"sentence_type":"body"},{"text":"Furthermore, her training system has directly propelled more than 20 students to win medals in global competitions, with a significant number transitioning to professional careers [Exhibit B4, p.3].","snippet_ids":["snip_f8d3acbe"],"subargument_id":"subarg-18ae28ea","argument_id":"arg-005","exhibit_refs":["B4-3"],"sentence_type":"body"},{"text":"Collectively, the Beneficiary's creation of a novel training system, its validation through elite athletic success, and her foundational role in democratizing the sport in China constitute original contributions of major significance to the field of Olympic weightlifting.","snippet_ids":[],"subargument_id":null,"argument_id":"arg-005","exhibit_refs":[],"sentence_type":"closing"}],"provenanceIndex":{"bySubArgument":{"subarg-74492d8f":[1,2],"subarg-3f5da824":[3,4],"subarg-af04653a":[5,6],"subarg-18ae28ea":[7,8]},"byArgument":{"arg-005":[0,1,2,3,4,5,6,7,8,9]},"bySnippet":{"snip_0b4a8714":[1],"snip_962697e3":[2],"snip_42ff06d0":[2],"snip_d433b0ca":[3],"snip_fe6210e8":[3],"snip_1523f22d":[4],"snip_68b58eb4":[4],"snip_ca5c82db":[5],"snip_b33bccda":[6],"snip_610f8046":[6],"snip_03bf57c5":[7],"snip_31433df1":[7],"snip_cc97a242":[7],"snip_f8d3acbe":[8]}}},{"id":"section-leading_role","title":"Leading Role","standardId":"leading_role","content":"The record demonstrates that the Beneficiary has satisfied the regulatory criterion at 8 C.F.R. §204.5(h)(3)(viii) by performing in a leading or critical role for distinguished organizations. The Beneficiary established foundational leadership and vision as the founder of Venus Weightlifting Club, where she established China's first Olympic weightlifting club and promoted the discipline in the general fitness market [Exhibit A-1]. Her foundational role is further confirmed by a letter of recommendation which states she possesses the drive to continue making significant contributions to the global weightlifting community [Exhibit B-2]. Under her leadership, the organization achieved significant international impact, including organizing a successful international training camp in Shanghai for athletes from various provinces [Exhibit B-1]. A collaborator noted the Beneficiary's extraordinary foresight and executive force, which ensured the professionalism and high standards of their cooperative project [Exhibit B-3], and she developed systematic training systems that advanced the popularization of amateur weightlifting [Exhibit B-4]. This global influence is formally documented through a Sponsorship Agreement entered into by the Club, demonstrating her capacity to secure strategic international partnerships [Exhibit F-2]. The Beneficiary's formal legal authority and ownership of Venus Weightlifting Club is conclusively established by official corporate documentation identifying her as the legal representative and shareholder [Exhibit F-1]. The Beneficiary also holds a critical role as a Shareholder, Founder, and Head Coach at ISHTAR HEALTH PTE. LTD., where she played a crucial role in the company's training programs, as confirmed by an official company letter [Exhibit F-6]. In this capacity, she has been instrumental in expanding the company's professional network by establishing relationships with international partners, demonstrating her critical impact on the organization's strategic direction [Exhibit F-6]. Therefore, the Beneficiary's documented roles as the founder, legal representative, and driving strategic force for these organizations unequivocally meet the regulatory standard for performing in a leading or critical capacity.","isGenerated":true,"order":3,"sentences":[{"text":"The record demonstrates that the Beneficiary has satisfied the regulatory criterion at 8 C.F.R. §204.5(h)(3)(viii) by performing in a leading or critical role for distinguished organizations.","snippet_ids":[],"subargument_id":null,"argument_id":"arg-006","exhibit_refs":[],"sentence_type":"opening"},{"text":"The Beneficiary established foundational leadership and vision as the founder of Venus Weightlifting Club, where she established China's first Olympic weightlifting club and promoted the discipline in the general fitness market [Exhibit A-1].","snippet_ids":["snip_6abb2620"],"subargument_id":"subarg-10bbd813","argument_id":"arg-006","exhibit_refs":["A-1"],"sentence_type":"body"},{"text":"Her foundational role is further confirmed by a letter of recommendation which states she possesses the drive to continue making significant contributions to the global weightlifting community [Exhibit B-2].","snippet_ids":["snip_0952daea"],"subargument_id":"subarg-10bbd813","argument_id":"arg-006","exhibit_refs":["B-2"],"sentence_type":"body"},{"text":"Under her leadership, the organization achieved significant international impact, including organizing a successful international training camp in Shanghai for athletes from various provinces [Exhibit B-1].","snippet_ids":["snip_85034054"],"subargument_id":"subarg-2f50e8d0","argument_id":"arg-006","exhibit_refs":["B-1"],"sentence_type":"body"},{"text":"A collaborator noted the Beneficiary's extraordinary foresight and executive force, which ensured the professionalism and high standards of their cooperative project [Exhibit B-3], and she developed systematic training systems that advanced the popularization of amateur weightlifting [Exhibit B-4].","snippet_ids":["snip_7ec80a4b","snip_bff4ebd2"],"subargument_id":"subarg-2f50e8d0","argument_id":"arg-006","exhibit_refs":["B-3","B-4"],"sentence_type":"body"},{"text":"This global influence is formally documented through a Sponsorship Agreement entered into by the Club, demonstrating her capacity to secure strategic international partnerships [Exhibit F-2].","snippet_ids":["snip_63834f93"],"subargument_id":"subarg-2f50e8d0","argument_id":"arg-006","exhibit_refs":["F-2"],"sentence_type":"body"},{"text":"The Beneficiary's formal legal authority and ownership of Venus Weightlifting Club is conclusively established by official corporate documentation identifying her as the legal representative and shareholder [Exhibit F-1].","snippet_ids":["snip_6ee98c93"],"subargument_id":"subarg-64fcc59d","argument_id":"arg-006","exhibit_refs":["F-1"],"sentence_type":"body"},{"text":"The Beneficiary also holds a critical role as a Shareholder, Founder, and Head Coach at ISHTAR HEALTH PTE. LTD., where she played a crucial role in the company's training programs, as confirmed by an official company letter [Exhibit F-6].","snippet_ids":["snip_7a94bbb1"],"subargument_id":"subarg-0f463463","argument_id":"arg-006","exhibit_refs":["F-6"],"sentence_type":"body"},{"text":"In this capacity, she has been instrumental in expanding the company's professional network by establishing relationships with international partners, demonstrating her critical impact on the organization's strategic direction [Exhibit F-6].","snippet_ids":["snip_28860ac4"],"subargument_id":"subarg-5e78d42e","argument_id":"arg-006","exhibit_refs":["F-6"],"sentence_type":"body"},{"text":"Therefore, the Beneficiary's documented roles as the founder, legal representative, and driving strategic force for these organizations unequivocally meet the regulatory standard for performing in a leading or critical capacity.","snippet_ids":[],"subargument_id":null,"argument_id":"arg-006","exhibit_refs":[],"sentence_type":"closing"}],"provenanceIndex":{"bySubArgument":{"subarg-10bbd813":[1,2],"subarg-2f50e8d0":[3,4,5],"subarg-64fcc59d":[6],"subarg-0f463463":[7],"subarg-5e78d42e":[8]},"byArgument":{"arg-006":[0,1,2,3,4,5,6,7,8,9]},"bySnippet":{"snip_6abb2620":[1],"snip_0952daea":[2],"snip_85034054":[3],"snip_7ec80a4b":[4],"snip_bff4ebd2":[4],"snip_63834f93":[5],"snip_6ee98c93":[6],"snip_7a94bbb1":[7],"snip_28860ac4":[8]}}}]`);

// Initial node positions for writing canvas
const getInitialWritingNodePositions = (): Map<string, Position> => {
  const positions = new Map<string, Position>();

  // Snippet positions (left side)
  const connectedSnippetIds = ['snip-1', 'snip-2', 'snip-3', 'snip-4', 'snip-5', 'snip-7', 'snip-9'];
  connectedSnippetIds.forEach((id, index) => {
    positions.set(id, { x: 120, y: 80 + index * 100 });
  });

  // Standard positions (right side)
  const connectedStandardIds = ['std-awards', 'std-contribution', 'std-leading', 'std-salary'];
  connectedStandardIds.forEach((id, index) => {
    positions.set(id, { x: 680, y: 120 + index * 120 });
  });

  return positions;
};

// Current project ID - can be changed to load different projects
const DEFAULT_PROJECT_ID = 'yaruo_qu';

export function AppProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectId] = useState<string>(DEFAULT_PROJECT_ID);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Pipeline state
  const [pipelineState, setPipelineState] = useState<PipelineState>({
    stage: 'ocr_complete',
    progress: 0,
  });

  // Start with empty snippets - will be loaded from backend
  const [snippets, setSnippets] = useState<Snippet[]>([]);

  // Start with empty connections - will be populated after snippet extraction
  const [connections, setConnections] = useState<Connection[]>([]);

  // Fetch pipeline stage and snippets from backend
  useEffect(() => {
    async function loadProjectData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        // Load pipeline stage
        try {
          const stageResponse = await apiClient.get<{
            stage: PipelineStage;
            can_extract: boolean;
            can_confirm: boolean;
            can_generate: boolean;
          }>(`/analysis/${projectId}/stage`);

          setPipelineState(prev => ({
            ...prev,
            stage: stageResponse.stage,
          }));
        } catch {
          // Default to ocr_complete if stage endpoint not available
          setPipelineState(prev => ({ ...prev, stage: 'ocr_complete' }));
        }

        // Try loading from unified extraction API first (has subject attribution)
        try {
          const extractionResponse = await apiClient.get<{
            project_id: string;
            total: number;
            snippets: UnifiedSnippet[];
          }>(`/extraction/${projectId}/snippets?limit=500`);

          if (extractionResponse.snippets && extractionResponse.snippets.length > 0) {
            const converted = extractionResponse.snippets.map(convertUnifiedSnippet);
            setSnippets(converted);
            setPipelineState(prev => ({ ...prev, stage: 'snippets_ready', snippetCount: converted.length }));
            console.log(`Loaded ${converted.length} unified extraction snippets from project ${projectId}`);

            // Also try to load generated arguments and sub-arguments from backend
            try {
              const argsResponse = await apiClient.get<{
                project_id: string;
                arguments: Array<{
                  id: string;
                  title: string;
                  subject: string;
                  snippet_ids: string[];
                  standard_key: string;
                  confidence: number;
                  created_at: string;
                  is_ai_generated: boolean;
                  sub_argument_ids?: string[];
                }>;
                sub_arguments: Array<{
                  id: string;
                  argument_id: string;
                  title: string;
                  purpose: string;
                  relationship: string;
                  snippet_ids: string[];
                  is_ai_generated: boolean;
                  status: string;
                  created_at: string;
                }>;
                main_subject: string | null;
                generated_at: string | null;
              }>(`/arguments/${projectId}`);

              if (argsResponse.arguments && argsResponse.arguments.length > 0) {
                const convertedArgs: Argument[] = argsResponse.arguments.map((arg) => ({
                  id: arg.id,
                  title: arg.title,
                  subject: arg.subject,
                  snippetIds: arg.snippet_ids,
                  standardKey: arg.standard_key,
                  claimType: (arg.standard_key || 'other') as ArgumentClaimType,
                  status: 'draft' as ArgumentStatus,
                  isAIGenerated: arg.is_ai_generated,
                  subArgumentIds: arg.sub_argument_ids || [],
                  createdAt: new Date(arg.created_at),
                  updatedAt: new Date(),
                }));
                setArguments(convertedArgs);
                console.log(`Loaded ${convertedArgs.length} generated arguments from backend`);
              }

              // Load sub-arguments
              if (argsResponse.sub_arguments && argsResponse.sub_arguments.length > 0) {
                const convertedSubArgs: SubArgument[] = argsResponse.sub_arguments.map((sa) => ({
                  id: sa.id,
                  argumentId: sa.argument_id,
                  title: sa.title,
                  purpose: sa.purpose,
                  relationship: sa.relationship,
                  snippetIds: sa.snippet_ids,
                  isAIGenerated: sa.is_ai_generated,
                  status: sa.status as 'draft' | 'verified',
                  createdAt: new Date(sa.created_at),
                  updatedAt: new Date(),
                }));
                setSubArguments(convertedSubArgs);
                console.log(`Loaded ${convertedSubArgs.length} sub-arguments from backend`);
              }
            } catch {
              // Arguments not available yet, that's fine
              console.log('No generated arguments found');
            }

            return; // Success, no need to try other sources
          }
        } catch {
          // Unified extraction not available, try legacy API
        }

        // Fall back to legacy analysis API
        const response = await apiClient.get<{
          project_id: string;
          total: number;
          snippets: BackendSnippet[];
        }>(`/analysis/${projectId}/snippets?limit=500`);

        if (response.snippets && response.snippets.length > 0) {
          const converted = response.snippets.map(convertBackendSnippet);
          setSnippets(converted);
          console.log(`Loaded ${converted.length} extracted snippets from project ${projectId}`);
          // NOTE: snippet→standard connections removed - classification at Argument level
        }

        // Also try to load generated arguments and sub-arguments (for legacy path)
        try {
          const argsResponse = await apiClient.get<{
            project_id: string;
            arguments: Array<{
              id: string;
              title: string;
              subject: string;
              snippet_ids: string[];
              standard_key: string;
              confidence: number;
              created_at: string;
              is_ai_generated: boolean;
              sub_argument_ids?: string[];
            }>;
            sub_arguments: Array<{
              id: string;
              argument_id: string;
              title: string;
              purpose: string;
              relationship: string;
              snippet_ids: string[];
              is_ai_generated: boolean;
              status: string;
              created_at: string;
            }>;
            main_subject: string | null;
            generated_at: string | null;
          }>(`/arguments/${projectId}`);

          if (argsResponse.arguments && argsResponse.arguments.length > 0) {
            const convertedArgs: Argument[] = argsResponse.arguments.map((arg) => ({
              id: arg.id,
              title: arg.title,
              subject: arg.subject,
              snippetIds: arg.snippet_ids,
              standardKey: arg.standard_key,
              claimType: (arg.standard_key || 'other') as ArgumentClaimType,
              status: 'draft' as ArgumentStatus,
              isAIGenerated: arg.is_ai_generated,
              subArgumentIds: arg.sub_argument_ids || [],
              createdAt: new Date(arg.created_at),
              updatedAt: new Date(),
            }));
            setArguments(convertedArgs);
            console.log(`Loaded ${convertedArgs.length} generated arguments from backend (legacy path)`);
          }

          // Load sub-arguments
          if (argsResponse.sub_arguments && argsResponse.sub_arguments.length > 0) {
            const convertedSubArgs: SubArgument[] = argsResponse.sub_arguments.map((sa) => ({
              id: sa.id,
              argumentId: sa.argument_id,
              title: sa.title,
              purpose: sa.purpose,
              relationship: sa.relationship,
              snippetIds: sa.snippet_ids,
              isAIGenerated: sa.is_ai_generated,
              status: sa.status as 'draft' | 'verified',
              createdAt: new Date(sa.created_at),
              updatedAt: new Date(),
            }));
            setSubArguments(convertedSubArgs);
            console.log(`Loaded ${convertedSubArgs.length} sub-arguments from backend (legacy path)`);
          }
        } catch {
          // Arguments not available yet, that's fine
          console.log('No generated arguments found (legacy path)');
        }

        if (!(response.snippets && response.snippets.length > 0)) {
          // Fall back to raw OCR data if no extracted snippets
          const rawResponse = await apiClient.get<{
            project_id: string;
            total: number;
            snippets: BackendSnippet[];
          }>(`/data/projects/${projectId}/snippets?limit=500`);

          if (rawResponse.snippets && rawResponse.snippets.length > 0) {
            const converted = rawResponse.snippets.map(convertBackendSnippet);
            setSnippets(converted);
            console.log(`Loaded ${converted.length} raw OCR blocks from project ${projectId}`);
          }
        }
      } catch (err) {
        console.error('Failed to load project data:', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load data');
        // Keep empty snippets on error - no mock data fallback
      } finally {
        setIsLoading(false);
      }
    }

    loadProjectData();
  }, [projectId]);

  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW_MODE);
    return (saved as ViewMode) || 'line';
  });

  // LLM Provider setting
  const [llmProvider, setLlmProviderState] = useState<LLMProvider>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LLM_PROVIDER);
    return (saved as LLMProvider) || 'deepseek';
  });

  // Page navigation state
  const [currentPage, setCurrentPage] = useState<PageType>('mapping');

  // Work mode state (verify vs write)
  const [workMode, setWorkMode] = useState<WorkMode>('verify');

  const setLlmProvider = useCallback((provider: LLMProvider) => {
    setLlmProviderState(provider);
    localStorage.setItem(STORAGE_KEY_LLM_PROVIDER, provider);
  }, []);

  // Writing canvas state
  const [arguments_, setArguments] = useState<Argument[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ARGUMENTS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((a: Argument) => ({ ...a, createdAt: new Date(a.createdAt) }));
    }
    return initialArguments;
  });

  const [writingEdges, setWritingEdges] = useState<WritingEdge[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_WRITING_EDGES);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((e: WritingEdge) => ({ ...e, createdAt: new Date(e.createdAt) }));
    }
    return initialWritingEdges;
  });

  const [letterSections, setLetterSections] = useState<LetterSection[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LETTER_SECTIONS);
    return saved ? JSON.parse(saved) : initialLetterSections;
  });

  const [writingNodePositions, setWritingNodePositions] = useState<Map<string, Position>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_WRITING_NODE_POSITIONS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return new Map(Object.entries(parsed));
    }
    return getInitialWritingNodePositions();
  });

  const [focusState, setFocusStateInternal] = useState<FocusState>({ type: 'none', id: null });
  // Selected snippet ID for PDF highlight (independent of focusState)
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null);

  // Wrapper for setFocusState: clear selectedSnippetId when focusing non-snippet
  const setFocusState = useCallback((state: FocusState) => {
    setFocusStateInternal(state);
    // Clear snippet selection when focusing on something other than snippet
    if (state.type !== 'snippet') {
      setSelectedSnippetId(null);
    }
  }, []);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [draggedSnippetId, setDraggedSnippetId] = useState<string | null>(null);
  const [snippetPositions, setSnippetPositions] = useState<Map<string, ElementPosition>>(new Map());
  const [pdfBboxPositions, setPdfBboxPositions] = useState<Map<string, ElementPosition>>(new Map());
  const [snippetPanelBounds, setSnippetPanelBounds] = useState<PanelBounds | null>(null);

  // Argument Assembly state (NEW)
  const [draggedArgumentId, setDraggedArgumentId] = useState<string | null>(null);
  const [argumentPositions, setArgumentPositions] = useState<Map<string, ElementPosition>>(new Map());
  const [subArgumentPositions, setSubArgumentPositions] = useState<Map<string, ElementPosition>>(new Map());
  const [hoveredSnippetId, setHoveredSnippetId] = useState<string | null>(null);
  const [argumentMappings, setArgumentMappings] = useState<WritingEdge[]>([]);

  // AI Argument Generation state
  const [isGeneratingArguments, setIsGeneratingArguments] = useState(false);
  const [generatedMainSubject, setGeneratedMainSubject] = useState<string | null>(null);

  // Unified Extraction state (NEW)
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<{ current: number; total: number; currentExhibit?: string } | null>(null);

  // Argument view mode (list vs graph) - default to graph
  const [argumentViewMode, setArgumentViewModeState] = useState<ArgumentViewMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ARGUMENT_VIEW_MODE);
    return (saved as ArgumentViewMode) || 'graph';
  });

  // Argument graph node positions (for graph view)
  const [argumentGraphPositions, setArgumentGraphPositions] = useState<Map<string, Position>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ARGUMENT_GRAPH_POSITIONS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return new Map(Object.entries(parsed));
    }
    return new Map();
  });

  // SubArguments state (次级子论点)
  const [subArguments, setSubArguments] = useState<SubArgument[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SUB_ARGUMENTS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((sa: SubArgument) => ({
        ...sa,
        createdAt: new Date(sa.createdAt),
        updatedAt: new Date(sa.updatedAt),
      }));
    }
    return [];
  });

  // Selection state for creating snippets
  const [selectionState, setSelectionState] = useState<SelectionState>({
    isSelecting: false,
    startPoint: null,
    endPoint: null,
    pageNumber: null,
    documentId: null,
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SNIPPETS, JSON.stringify(snippets));
  }, [snippets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CONNECTIONS, JSON.stringify(connections));
  }, [connections]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, viewMode);
  }, [viewMode]);

  // Persist writing canvas state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ARGUMENTS, JSON.stringify(arguments_));
  }, [arguments_]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WRITING_EDGES, JSON.stringify(writingEdges));
  }, [writingEdges]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LETTER_SECTIONS, JSON.stringify(letterSections));
  }, [letterSections]);

  useEffect(() => {
    const obj: Record<string, Position> = {};
    writingNodePositions.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(STORAGE_KEY_WRITING_NODE_POSITIONS, JSON.stringify(obj));
  }, [writingNodePositions]);

  // Persist argument view mode
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ARGUMENT_VIEW_MODE, argumentViewMode);
  }, [argumentViewMode]);

  // Persist argument graph positions
  useEffect(() => {
    const obj: Record<string, Position> = {};
    argumentGraphPositions.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(STORAGE_KEY_ARGUMENT_GRAPH_POSITIONS, JSON.stringify(obj));
  }, [argumentGraphPositions]);

  // Persist sub-arguments
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SUB_ARGUMENTS, JSON.stringify(subArguments));
  }, [subArguments]);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
  }, []);

  // Argument view mode setter
  const setArgumentViewMode = useCallback((mode: ArgumentViewMode) => {
    setArgumentViewModeState(mode);
  }, []);

  // Update argument graph position
  const updateArgumentGraphPosition = useCallback((id: string, position: Position) => {
    setArgumentGraphPositions(prev => {
      const newMap = new Map(prev);
      newMap.set(id, position);
      return newMap;
    });
  }, []);

  // Clear all argument graph positions (for auto-arrange)
  const clearArgumentGraphPositions = useCallback(() => {
    setArgumentGraphPositions(new Map());
  }, []);

  const clearFocus = useCallback(() => {
    setFocusState({ type: 'none', id: null });
  }, []);

  const addConnection = useCallback((snippetId: string, standardId: string, isConfirmed: boolean) => {
    // Check if connection already exists
    const exists = connections.some(
      conn => conn.snippetId === snippetId && conn.standardId === standardId
    );
    if (exists) {
      // If it exists and we want to confirm, just confirm it
      if (isConfirmed) {
        setConnections(prev => prev.map(conn =>
          conn.snippetId === snippetId && conn.standardId === standardId
            ? { ...conn, isConfirmed: true }
            : conn
        ));
      }
      return;
    }

    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      snippetId,
      standardId,
      isConfirmed,
      createdAt: new Date(),
    };
    setConnections(prev => [...prev, newConnection]);
  }, [connections]);

  const removeConnection = useCallback((connectionId: string) => {
    setConnections(prev => prev.filter(conn => conn.id !== connectionId));
  }, []);

  const confirmConnection = useCallback((connectionId: string) => {
    setConnections(prev => prev.map(conn =>
      conn.id === connectionId ? { ...conn, isConfirmed: true } : conn
    ));
  }, []);

  const updateSnippetPosition = useCallback((id: string, position: ElementPosition) => {
    setSnippetPositions(prev => {
      const newMap = new Map(prev);
      newMap.set(id, position);
      return newMap;
    });
  }, []);

  const updatePdfBboxPosition = useCallback((id: string, position: ElementPosition) => {
    setPdfBboxPositions(prev => {
      const newMap = new Map(prev);
      newMap.set(id, position);
      return newMap;
    });
  }, []);

  // Snippet management
  const addSnippet = useCallback((snippetData: Omit<Snippet, 'id'>) => {
    const newSnippet: Snippet = {
      ...snippetData,
      id: `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    setSnippets(prev => [...prev, newSnippet]);
  }, []);

  const removeSnippet = useCallback((snippetId: string) => {
    setSnippets(prev => prev.filter(s => s.id !== snippetId));
    // Also remove all connections involving this snippet
    setConnections(prev => prev.filter(c => c.snippetId !== snippetId));
  }, []);

  // Selection methods for creating snippets
  const startSelection = useCallback((documentId: string, pageNumber: number, point: { x: number; y: number }) => {
    setSelectionState({
      isSelecting: true,
      startPoint: point,
      endPoint: point,
      pageNumber,
      documentId,
    });
  }, []);

  const updateSelection = useCallback((point: { x: number; y: number }) => {
    setSelectionState(prev => ({
      ...prev,
      endPoint: point,
    }));
  }, []);

  const endSelection = useCallback(() => {
    if (!selectionState.isSelecting || !selectionState.startPoint || !selectionState.endPoint ||
        !selectionState.documentId || selectionState.pageNumber === null) {
      return null;
    }

    const { startPoint, endPoint, pageNumber, documentId } = selectionState;

    // Calculate bounding box (normalize so x,y is always top-left)
    const boundingBox: BoundingBox = {
      x: Math.min(startPoint.x, endPoint.x),
      y: Math.min(startPoint.y, endPoint.y),
      width: Math.abs(endPoint.x - startPoint.x),
      height: Math.abs(endPoint.y - startPoint.y),
      page: pageNumber,
    };

    // Reset selection state
    setSelectionState({
      isSelecting: false,
      startPoint: null,
      endPoint: null,
      pageNumber: null,
      documentId: null,
    });

    // Only return if the selection is meaningful (not just a click)
    if (boundingBox.width < 10 || boundingBox.height < 10) {
      return null;
    }

    return { boundingBox, documentId };
  }, [selectionState]);

  const cancelSelection = useCallback(() => {
    setSelectionState({
      isSelecting: false,
      startPoint: null,
      endPoint: null,
      pageNumber: null,
      documentId: null,
    });
  }, []);

  // ============================================
  // Writing Canvas Methods
  // ============================================

  // Argument management
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
    // Also remove all edges connected to this argument
    setWritingEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    // Also remove argument mappings
    setArgumentMappings(prev => prev.filter(e => e.source !== id));
  }, []);

  const updateArgumentPosition = useCallback((id: string, position: Position) => {
    setArguments(prev => prev.map(arg =>
      arg.id === id ? { ...arg, position, updatedAt: new Date() } : arg
    ));
  }, []);

  // Snippet to Argument operations (NEW)
  const addSnippetToArgument = useCallback((argumentId: string, snippetId: string) => {
    setArguments(prev => prev.map(arg => {
      if (arg.id === argumentId) {
        // Avoid duplicates
        if (arg.snippetIds.includes(snippetId)) return arg;
        return {
          ...arg,
          snippetIds: [...arg.snippetIds, snippetId],
          updatedAt: new Date(),
        };
      }
      return arg;
    }));
  }, []);

  const removeSnippetFromArgument = useCallback((argumentId: string, snippetId: string) => {
    setArguments(prev => prev.map(arg => {
      if (arg.id === argumentId) {
        return {
          ...arg,
          snippetIds: arg.snippetIds.filter(id => id !== snippetId),
          updatedAt: new Date(),
        };
      }
      return arg;
    }));
  }, []);

  // ============================================
  // SubArgument Management (次级子论点)
  // ============================================

  const addSubArgument = useCallback((subArgumentData: Omit<SubArgument, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newSubArgument: SubArgument = {
      ...subArgumentData,
      id: `subarg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setSubArguments(prev => [...prev, newSubArgument]);

    // Also update the parent argument's subArgumentIds
    setArguments(prev => prev.map(arg => {
      if (arg.id === subArgumentData.argumentId) {
        const existingSubArgIds = arg.subArgumentIds || [];
        return {
          ...arg,
          subArgumentIds: [...existingSubArgIds, newSubArgument.id],
          updatedAt: new Date(),
        };
      }
      return arg;
    }));
  }, []);

  const updateSubArgument = useCallback((id: string, updates: Partial<Omit<SubArgument, 'id' | 'createdAt'>>) => {
    setSubArguments(prev => prev.map(sa =>
      sa.id === id ? { ...sa, ...updates, updatedAt: new Date() } : sa
    ));
  }, []);

  const removeSubArgument = useCallback((id: string) => {
    const subArg = subArguments.find(sa => sa.id === id);
    setSubArguments(prev => prev.filter(sa => sa.id !== id));

    // Also update the parent argument's subArgumentIds
    if (subArg) {
      setArguments(prev => prev.map(arg => {
        if (arg.id === subArg.argumentId) {
          return {
            ...arg,
            subArgumentIds: (arg.subArgumentIds || []).filter(saId => saId !== id),
            updatedAt: new Date(),
          };
        }
        return arg;
      }));
    }
  }, [subArguments]);

  // Argument → Standard mapping (NEW - replaces snippet → standard)
  const addArgumentMapping = useCallback((argumentId: string, standardKey: string) => {
    // Check if mapping already exists
    const exists = argumentMappings.some(
      e => e.source === argumentId && e.target === standardKey
    );
    if (exists) return;

    const newMapping: WritingEdge = {
      id: `am-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: argumentId,
      target: standardKey,
      type: 'argument-to-standard',
      isConfirmed: true,  // User dragged = confirmed
      createdAt: new Date(),
    };
    setArgumentMappings(prev => [...prev, newMapping]);

    // Also update the argument's standardKey
    setArguments(prev => prev.map(arg =>
      arg.id === argumentId ? { ...arg, standardKey, status: 'mapped' as const, updatedAt: new Date() } : arg
    ));
  }, [argumentMappings]);

  const removeArgumentMapping = useCallback((edgeId: string) => {
    const mapping = argumentMappings.find(e => e.id === edgeId);
    setArgumentMappings(prev => prev.filter(e => e.id !== edgeId));

    // Also clear the argument's standardKey
    if (mapping) {
      setArguments(prev => prev.map(arg =>
        arg.id === mapping.source ? { ...arg, standardKey: undefined, status: 'verified' as const, updatedAt: new Date() } : arg
      ));
    }
  }, [argumentMappings]);

  // Argument position for connection lines (NEW)
  const updateArgumentPosition2 = useCallback((id: string, position: ElementPosition) => {
    setArgumentPositions(prev => {
      const newMap = new Map(prev);
      newMap.set(id, position);
      return newMap;
    });
  }, []);

  const updateSubArgumentPosition = useCallback((id: string, position: ElementPosition) => {
    setSubArgumentPositions(prev => {
      const newMap = new Map(prev);
      newMap.set(id, position);
      return newMap;
    });
  }, []);

  // Writing edge management
  const addWritingEdge = useCallback((source: string, target: string, type: WritingEdge['type']) => {
    // Check if edge already exists
    const exists = writingEdges.some(e => e.source === source && e.target === target);
    if (exists) return;

    const newEdge: WritingEdge = {
      id: `we-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source,
      target,
      type,
      isConfirmed: false,
      createdAt: new Date(),
    };
    setWritingEdges(prev => [...prev, newEdge]);
  }, [writingEdges]);

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

  const getConnectionsForSnippet = useCallback((snippetId: string) => {
    return connections.filter(conn => conn.snippetId === snippetId);
  }, [connections]);

  const getConnectionsForStandard = useCallback((standardId: string) => {
    return connections.filter(conn => conn.standardId === standardId);
  }, [connections]);

  const isElementHighlighted = useCallback((elementType: 'snippet' | 'standard', elementId: string): boolean => {
    if (focusState.type === 'none') return true;

    if (focusState.type === 'snippet' && focusState.id) {
      if (elementType === 'snippet') {
        return elementId === focusState.id;
      }
      // For standards, check if connected to the focused snippet via arguments
      return arguments_.some(arg => {
        if (!arg.snippetIds?.includes(focusState.id!)) return false;
        // Check AI-generated standardKey mapping
        if (arg.standardKey && STANDARD_KEY_TO_ID[arg.standardKey] === elementId) return true;
        // Check manual mapping
        return argumentMappings.some(m => m.source === arg.id && m.target === elementId);
      });
    }

    if (focusState.type === 'standard' && focusState.id) {
      if (elementType === 'standard') {
        return elementId === focusState.id;
      }
      // For snippets, check if connected to the focused standard via arguments
      const focusedStandardId = focusState.id;
      return arguments_.some(arg => {
        if (!arg.snippetIds?.includes(elementId)) return false;
        // Check AI-generated standardKey mapping
        if (arg.standardKey && STANDARD_KEY_TO_ID[arg.standardKey] === focusedStandardId) return true;
        // Check manual mapping
        return argumentMappings.some(m => m.source === arg.id && m.target === focusedStandardId);
      });
    }

    if (focusState.type === 'argument' && focusState.id) {
      if (elementType === 'snippet') {
        // Check if snippet belongs to the focused argument
        const focusedArg = arguments_.find(arg => arg.id === focusState.id);
        return focusedArg?.snippetIds?.includes(elementId) || false;
      }
      if (elementType === 'standard') {
        // Check if standard is mapped to the focused argument
        const focusedArg = arguments_.find(arg => arg.id === focusState.id);
        if (!focusedArg) return false;
        // Check AI-generated standardKey mapping
        if (focusedArg.standardKey && STANDARD_KEY_TO_ID[focusedArg.standardKey] === elementId) return true;
        // Check manual mapping
        return argumentMappings.some(m => m.source === focusState.id && m.target === elementId);
      }
    }

    if (focusState.type === 'document' && focusState.id) {
      if (elementType === 'snippet') {
        const snip = snippets.find(s => s.id === elementId);
        return snip?.documentId === focusState.id;
      }
      // For standards, check if any connected snippets are from the focused document
      return connections.some(conn => {
        if (conn.standardId !== elementId) return false;
        const snip = snippets.find(s => s.id === conn.snippetId);
        return snip?.documentId === focusState.id;
      });
    }

    return true;
  }, [focusState, connections, snippets, arguments_, argumentMappings]);

  // ============================================
  // Pipeline Methods
  // ============================================

  const extractSnippets = useCallback(async () => {
    setPipelineState(prev => ({ ...prev, stage: 'extracting', progress: 0 }));
    try {
      const response = await apiClient.post<{
        success: boolean;
        snippet_count: number;
        by_standard: Record<string, number>;
        message: string;
      }>(`/analysis/extract/${projectId}`, { use_llm: false });

      if (response.success) {
        setPipelineState(prev => ({
          ...prev,
          stage: 'snippets_ready',
          progress: 100,
          snippetCount: response.snippet_count,
        }));

        // Reload snippets
        const snippetsResponse = await apiClient.get<{
          snippets: BackendSnippet[];
        }>(`/analysis/${projectId}/snippets?limit=500`);

        if (snippetsResponse.snippets) {
          const converted = snippetsResponse.snippets.map(convertBackendSnippet);
          setSnippets(converted);
        }
      }
    } catch (err) {
      setPipelineState(prev => ({
        ...prev,
        stage: 'ocr_complete',
        error: err instanceof Error ? err.message : 'Extraction failed',
      }));
    }
  }, [projectId]);

  const confirmAllMappings = useCallback(async () => {
    setPipelineState(prev => ({ ...prev, stage: 'confirming' }));
    try {
      const response = await apiClient.post<{
        success: boolean;
        confirmed_count: number;
      }>(`/analysis/${projectId}/snippets/confirm-all`, {});

      if (response.success) {
        setPipelineState(prev => ({
          ...prev,
          stage: 'mapping_confirmed',
          confirmedMappings: response.confirmed_count,
        }));
      }
    } catch (err) {
      setPipelineState(prev => ({
        ...prev,
        stage: 'snippets_ready',
        error: err instanceof Error ? err.message : 'Confirmation failed',
      }));
    }
  }, [projectId]);

  const generatePetition = useCallback(async () => {
    setPipelineState(prev => ({ ...prev, stage: 'generating', progress: 0 }));
    try {
      // Get all available sections (EB-1A standards that have snippets)
      const standardsToGenerate = [
        'awards',
        'membership',
        'published_material',
        'judging',
        'original_contribution',
        'scholarly_articles',
        'leading_role',
        'exhibitions'
      ];

      const generatedSections: LetterSection[] = [];

      for (let i = 0; i < standardsToGenerate.length; i++) {
        const section = standardsToGenerate[i];
        setPipelineState(prev => ({
          ...prev,
          progress: Math.round((i / standardsToGenerate.length) * 100),
        }));

        try {
          // Use V3 API for SubArgument-aware generation
          const response = await apiClient.post<{
            success: boolean;
            section: string;
            paragraph_text: string;
            sentences: Array<{
              text: string;
              snippet_ids: string[];
              subargument_id?: string | null;
              argument_id?: string | null;
              exhibit_refs?: string[];
              sentence_type?: 'opening' | 'body' | 'closing';
            }>;
            provenance_index?: {
              by_subargument: Record<string, number[]>;
              by_argument: Record<string, number[]>;
              by_snippet: Record<string, number[]>;
            };
            validation?: {
              total_sentences: number;
              traced_sentences: number;
              warnings: string[];
            };
          }>(`/write/v3/${projectId}/${section}`, {});

          if (response.success && response.paragraph_text) {
            generatedSections.push({
              id: `section-${section}`,
              title: section.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              standardId: section,
              content: response.paragraph_text,
              isGenerated: true,
              order: i,
              sentences: response.sentences,
              provenanceIndex: response.provenance_index,
            });
          }
        } catch (sectionErr) {
          // Skip sections that fail (may not have snippets/arguments)
          console.log(`Skipped section ${section}:`, sectionErr);
        }
      }

      // Update letter sections state
      if (generatedSections.length > 0) {
        setLetterSections(generatedSections);
      }

      setPipelineState(prev => ({
        ...prev,
        stage: 'petition_ready',
        progress: 100,
      }));
    } catch (err) {
      setPipelineState(prev => ({
        ...prev,
        stage: 'mapping_confirmed',
        error: err instanceof Error ? err.message : 'Generation failed',
      }));
    }
  }, [projectId]);

  // Computed properties for pipeline state
  const canExtract = pipelineState.stage === 'ocr_complete';
  const canConfirm = pipelineState.stage === 'snippets_ready';
  const canGenerate = pipelineState.stage === 'mapping_confirmed';

  // AI Argument Generation - uses new legal pipeline with sub-arguments
  const generateArguments = useCallback(async (forceReanalyze: boolean = false, applicantName?: string) => {
    setIsGeneratingArguments(true);
    try {
      // Step 1: Run the generation pipeline (creates legal_arguments.json with arguments + sub_arguments)
      await apiClient.post<{
        success: boolean;
      }>(`/arguments/${projectId}/generate`, {
        force_reanalyze: forceReanalyze,
        applicant_name: applicantName,
        provider: llmProvider  // Pass LLM provider selection
      });

      // Step 2: Fetch generated arguments and sub-arguments from main endpoint
      const response = await apiClient.get<{
        project_id: string;
        arguments: Array<{
          id: string;
          title: string;
          subject: string;
          snippet_ids: string[];
          standard_key: string;
          confidence: number;
          created_at: string;
          is_ai_generated: boolean;
          sub_argument_ids?: string[];
          // Extended lawyer-style fields
          exhibits?: string[];
          layers?: {
            claim: Array<{ text: string; exhibit_id: string; purpose: string; snippet_id: string }>;
            proof: Array<{ text: string; exhibit_id: string; purpose: string; snippet_id: string }>;
            significance: Array<{ text: string; exhibit_id: string; purpose: string; snippet_id: string }>;
            context: Array<{ text: string; exhibit_id: string; purpose: string; snippet_id: string }>;
          };
          conclusion?: string;
          completeness?: {
            has_claim: boolean;
            has_proof: boolean;
            has_significance: boolean;
            has_context: boolean;
            score: number;
          };
        }>;
        sub_arguments: Array<{
          id: string;
          argument_id: string;
          title: string;
          purpose: string;
          relationship: string;
          snippet_ids: string[];
          is_ai_generated: boolean;
          status: string;
          created_at: string;
        }>;
        main_subject: string | null;
        generated_at: string;
        stats: Record<string, unknown>;
      }>(`/arguments/${projectId}`);

      setGeneratedMainSubject(response.main_subject);

      // Convert backend arguments to frontend format
      const convertedArguments: Argument[] = response.arguments.map((arg) => ({
        id: arg.id,
        title: arg.title,
        subject: arg.subject,
        snippetIds: arg.snippet_ids,
        standardKey: arg.standard_key,
        claimType: (arg.standard_key || 'other') as ArgumentClaimType,
        status: 'draft' as ArgumentStatus,
        isAIGenerated: arg.is_ai_generated,
        subArgumentIds: arg.sub_argument_ids || [],
        createdAt: new Date(arg.created_at),
        updatedAt: new Date(),
        // Extended fields for lawyer-style display
        exhibits: arg.exhibits,
        layers: arg.layers,
        conclusion: arg.conclusion,
        completeness: arg.completeness,
      }));

      setArguments(convertedArguments);
      console.log(`Generated ${convertedArguments.length} arguments for ${response.main_subject}`);

      // Convert and set sub-arguments
      if (response.sub_arguments && response.sub_arguments.length > 0) {
        const convertedSubArgs: SubArgument[] = response.sub_arguments.map((sa) => ({
          id: sa.id,
          argumentId: sa.argument_id,
          title: sa.title,
          purpose: sa.purpose,
          relationship: sa.relationship,
          snippetIds: sa.snippet_ids,
          isAIGenerated: sa.is_ai_generated,
          status: sa.status as 'draft' | 'verified',
          createdAt: new Date(sa.created_at),
          updatedAt: new Date(),
        }));
        setSubArguments(convertedSubArgs);
        console.log(`Generated ${convertedSubArgs.length} sub-arguments`);
      }
    } catch (err) {
      console.error('Failed to generate arguments:', err);
      throw err;
    } finally {
      setIsGeneratingArguments(false);
    }
  }, [projectId, llmProvider]);

  // Reload snippets from backend
  const reloadSnippets = useCallback(async () => {
    try {
      const response = await apiClient.get<{
        snippets: BackendSnippet[];
      }>(`/analysis/${projectId}/snippets?limit=500`);

      if (response.snippets && response.snippets.length > 0) {
        const converted = response.snippets.map(convertBackendSnippet);
        setSnippets(converted);
        console.log(`Reloaded ${converted.length} extracted snippets`);
        // NOTE: snippet→standard connections removed - classification at Argument level
      }
    } catch (err) {
      console.error('Failed to reload snippets:', err);
    }
  }, [projectId]);

  // ============================================
  // Unified Extraction Methods (NEW)
  // ============================================

  // Unified extraction - extract snippets + entities + relations in one pass
  const unifiedExtract = useCallback(async (applicantName: string) => {
    setIsExtracting(true);
    setExtractionProgress({ current: 0, total: 0 });
    setPipelineState(prev => ({ ...prev, stage: 'extracting', progress: 0 }));

    try {
      const response = await apiClient.post<{
        success: boolean;
        exhibits_processed: number;
        total_snippets: number;
        total_entities: number;
        total_relations: number;
        error?: string;
      }>(`/extraction/${projectId}/extract`, {
        applicant_name: applicantName,
        provider: llmProvider  // Pass LLM provider selection
      });

      if (response.success) {
        setPipelineState(prev => ({
          ...prev,
          stage: 'snippets_ready',
          progress: 100,
          snippetCount: response.total_snippets,
        }));

        // Reload snippets from unified extraction
        const snippetsResponse = await apiClient.get<{
          project_id: string;
          total: number;
          snippets: UnifiedSnippet[];
        }>(`/extraction/${projectId}/snippets?limit=500`);

        if (snippetsResponse.snippets) {
          const converted = snippetsResponse.snippets.map(convertUnifiedSnippet);
          setSnippets(converted);
          console.log(`Loaded ${converted.length} unified extraction snippets`);
        }
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
  }, [projectId, llmProvider]);

  // Generate merge suggestions - returns suggestions for immediate use
  const generateMergeSuggestions = useCallback(async (applicantName: string): Promise<MergeSuggestion[]> => {
    setIsMerging(true);
    try {
      const response = await apiClient.post<{
        success: boolean;
        suggestion_count: number;
        suggestions: MergeSuggestion[];
      }>(`/extraction/${projectId}/merge-suggestions/generate`, {
        applicant_name: applicantName,
        provider: llmProvider  // Pass LLM provider selection
      });

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
  }, [projectId, llmProvider]);

  // Load existing merge suggestions
  const loadMergeSuggestions = useCallback(async () => {
    try {
      const response = await apiClient.get<{
        project_id: string;
        suggestions: MergeSuggestion[];
        status: { pending: number; accepted: number; rejected: number; applied: number };
      }>(`/extraction/${projectId}/merge-suggestions`);

      setMergeSuggestions(response.suggestions);
    } catch (err) {
      console.error('Failed to load merge suggestions:', err);
    }
  }, [projectId]);

  // Confirm/reject merge suggestions
  const confirmMerges = useCallback(async (confirmations: Array<{suggestion_id: string; status: string}>) => {
    try {
      const response = await apiClient.post<{
        success: boolean;
        updated: number;
      }>(`/extraction/${projectId}/merges/confirm`, confirmations);

      if (response.success) {
        // Reload suggestions to get updated statuses
        await loadMergeSuggestions();
        console.log(`Updated ${response.updated} merge confirmations`);
      }
    } catch (err) {
      console.error('Failed to confirm merges:', err);
      throw err;
    }
  }, [projectId, loadMergeSuggestions]);

  // Apply confirmed merges
  const applyMerges = useCallback(async () => {
    setIsMerging(true);
    try {
      const response = await apiClient.post<{
        success: boolean;
        applied_count: number;
        updated_snippets: number;
        updated_relations: number;
        error?: string;
      }>(`/extraction/${projectId}/merges/apply`, {});

      if (response.success) {
        console.log(`Applied ${response.applied_count} merges, updated ${response.updated_snippets} snippets`);

        // Reload snippets with updated subject names
        const snippetsResponse = await apiClient.get<{
          project_id: string;
          total: number;
          snippets: UnifiedSnippet[];
        }>(`/extraction/${projectId}/snippets?limit=500`);

        if (snippetsResponse.snippets) {
          const converted = snippetsResponse.snippets.map(convertUnifiedSnippet);
          setSnippets(converted);
        }

        // Clear suggestions
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
  }, [projectId]);

  const value: AppContextType = {
    projectId,
    setProjectId,
    isLoading,
    loadError,
    // AI Argument Generation
    isGeneratingArguments,
    generateArguments,
    generatedMainSubject,
    connections,
    allSnippets: snippets,
    focusState,
    setFocusState,
    clearFocus,
    selectedSnippetId,
    setSelectedSnippetId,
    selectedDocumentId,
    setSelectedDocumentId,
    addConnection,
    removeConnection,
    confirmConnection,
    draggedSnippetId,
    setDraggedSnippetId,
    snippetPositions,
    pdfBboxPositions,
    updateSnippetPosition,
    updatePdfBboxPosition,
    snippetPanelBounds,
    setSnippetPanelBounds,
    viewMode,
    setViewMode,
    // Argument view mode (list vs graph)
    argumentViewMode,
    setArgumentViewMode,
    // Argument graph node positions
    argumentGraphPositions,
    updateArgumentGraphPosition,
    clearArgumentGraphPositions,
    addSnippet,
    removeSnippet,
    selectionState,
    setSelectionState,
    startSelection,
    updateSelection,
    endSelection,
    cancelSelection,
    getConnectionsForSnippet,
    getConnectionsForStandard,
    isElementHighlighted,
    // Argument Assembly state (NEW)
    arguments: arguments_,
    addArgument,
    updateArgument,
    removeArgument,
    updateArgumentPosition,
    addSnippetToArgument,
    removeSnippetFromArgument,
    argumentMappings,
    addArgumentMapping,
    removeArgumentMapping,
    draggedArgumentId,
    setDraggedArgumentId,
    argumentPositions,
    updateArgumentPosition2,
    subArgumentPositions,
    updateSubArgumentPosition,
    hoveredSnippetId,
    setHoveredSnippetId,
    // SubArgument state (次级子论点)
    subArguments,
    addSubArgument,
    updateSubArgument,
    removeSubArgument,
    // Writing canvas state (kept for step 2)
    writingEdges,
    addWritingEdge,
    removeWritingEdge,
    confirmWritingEdge,
    letterSections,
    updateLetterSection,
    writingNodePositions,
    updateWritingNodePosition,
    // Pipeline state
    pipelineState,
    extractSnippets,
    confirmAllMappings,
    generatePetition,
    reloadSnippets,
    canExtract,
    canConfirm,
    canGenerate,
    // Unified Extraction state (NEW)
    unifiedExtract,
    generateMergeSuggestions,
    confirmMerges,
    applyMerges,
    mergeSuggestions,
    loadMergeSuggestions,
    isExtracting,
    isMerging,
    extractionProgress,
    // LLM Provider
    llmProvider,
    setLlmProvider,
    // Page Navigation
    currentPage,
    setCurrentPage,
    // Work Mode
    workMode,
    setWorkMode,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
