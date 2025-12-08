'use client';

import { useState, useEffect, useCallback } from 'react';
import { relationshipApi } from '@/utils/api';
import type { Quote } from '@/types';

export interface Entity {
  id: string;
  type: string;
  name: string;
  documents: string[];
  attributes: Record<string, unknown>;
}

export interface Relation {
  source_id: string;
  target_id: string;
  relation_type: string;
  evidence: string[];
  description: string;
}

export interface EvidenceChain {
  claim: string;
  documents: string[];
  strength: string;
  reasoning: string;
}

export interface RelationshipGraph {
  entities: Entity[];
  relations: Relation[];
  evidence_chains: EvidenceChain[];
}

interface RelationshipPanelProps {
  projectId: string;
  documentsCount: number;
  beneficiaryName?: string;
  quotesByStandard: Record<string, Quote[]>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onAnalysisComplete?: (graph: RelationshipGraph) => void;
}

type TabType = 'manual' | 'auto';

// Generate relationship analysis prompt
function generateRelationshipPrompt(beneficiaryName: string): string {
  return `You are a Senior L-1 Immigration Paralegal. Analyze relationships between entities across the following L-1 visa evidence documents.

**L-1 Visa: 4 Core Legal Requirements:**
1. **Qualifying Corporate Relationship** - Parent/subsidiary/affiliate relationship between foreign and U.S. entities
2. **Qualifying Employment Abroad** - At least 1 year of continuous employment with the foreign entity in the past 3 years
3. **Qualifying Capacity** - L-1A (Executive/Managerial) or L-1B (Specialized Knowledge) role
4. **Doing Business (Active Operations)** - Both entities must be actively doing business
${beneficiaryName ? `\nBeneficiary: ${beneficiaryName}\n` : ''}
**DOCUMENTS WITH EXTRACTED QUOTES:**
[ANALYSIS_RESULTS_HERE]

**Your Task:**
Based on the quotes extracted from the documents above, identify:
1. **Entities**: People, companies, positions mentioned across documents
2. **Relations**: Relationships between entities (e.g., "employed_by", "owns", "subsidiary_of", "manages")
3. **Evidence Chains**: How the documents support each L-1 standard (qualifying_relationship, qualifying_employment, qualifying_capacity, doing_business)

**Return JSON:**
{
  "entities": [
    {"id": "e1", "type": "person|company|position", "name": "...", "documents": ["exhibit_id"], "attributes": {"role": "...", "title": "..."}}
  ],
  "relations": [
    {"source_id": "e1", "target_id": "e2", "relation_type": "employed_by|owns|subsidiary_of|manages|founded", "evidence": ["exhibit_id"], "description": "..."}
  ],
  "evidence_chains": [
    {"claim": "Qualifying Corporate Relationship|Qualifying Employment Abroad|Qualifying Capacity|Doing Business", "documents": ["exhibit_id"], "strength": "strong|moderate|weak", "reasoning": "..."}
  ]
}`;
}

// Format analysis results for LLM
function formatAnalysisResults(quotesByStandard: Record<string, Quote[]>): string {
  const docs: Record<string, { exhibit_id: string; file_name: string; quotes: Quote[] }> = {};

  // Group quotes by exhibit
  Object.values(quotesByStandard).flat().forEach(quote => {
    const exhibitId = quote.source.exhibit_id;
    if (!docs[exhibitId]) {
      docs[exhibitId] = {
        exhibit_id: exhibitId,
        file_name: quote.source.file_name,
        quotes: []
      };
    }
    docs[exhibitId].quotes.push(quote);
  });

  return JSON.stringify(Object.values(docs), null, 2);
}

export default function RelationshipPanel({
  projectId,
  documentsCount,
  beneficiaryName = '',
  quotesByStandard,
  onError,
  onSuccess,
  onAnalysisComplete,
}: RelationshipPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('manual');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [graph, setGraph] = useState<RelationshipGraph | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'entities' | 'relations' | 'chains'>('entities');

  // Manual mode state
  const [pastedResult, setPastedResult] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copiedCombined, setCopiedCombined] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const totalQuotes = Object.values(quotesByStandard).flat().length;

  // Load existing relationship analysis on mount
  useEffect(() => {
    loadExistingAnalysis();
  }, [projectId]);

  const loadExistingAnalysis = async () => {
    try {
      const result = await relationshipApi.getLatest(projectId);
      // The API returns { version_id, data } where data contains the graph
      if (result && result.data && result.data.entities) {
        setGraph(result.data);
      }
    } catch {
      // No existing analysis - that's fine
    }
  };

  // Generate combined prompt + analysis results
  const getCombinedPrompt = useCallback(() => {
    const prompt = generateRelationshipPrompt(beneficiaryName);
    const analysisResults = formatAnalysisResults(quotesByStandard);
    return prompt.replace('[ANALYSIS_RESULTS_HERE]', analysisResults);
  }, [beneficiaryName, quotesByStandard]);

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedCombined(true);
    setTimeout(() => setCopiedCombined(false), 2000);
  };

  // Validate JSON
  const validateJSON = (jsonStr: string) => {
    if (!jsonStr.trim()) {
      setJsonError(null);
      return;
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.entities && parsed.relations && parsed.evidence_chains) {
        setJsonError(null);
      } else {
        setJsonError('Invalid format: expected { entities, relations, evidence_chains }');
      }
    } catch (e) {
      setJsonError(`JSON Parse Error: ${(e as Error).message}`);
    }
  };

  // Handle paste result change
  const handlePasteChange = (value: string) => {
    setPastedResult(value);
    validateJSON(value);
  };

  // Save manual analysis
  const handleSaveManual = async () => {
    if (!pastedResult.trim() || jsonError || isSaving) return;

    try {
      setIsSaving(true);
      const parsed = JSON.parse(pastedResult);

      // Save to backend
      const result = await relationshipApi.saveManual(projectId, {
        entities: parsed.entities || [],
        relations: parsed.relations || [],
        evidence_chains: parsed.evidence_chains || [],
      });

      if (result.success) {
        setGraph(parsed);
        onSuccess(`Saved relationship analysis: ${result.saved.entities} entities, ${result.saved.relations} relations`);
        setPastedResult('');
        // Notify parent of analysis completion for entity name extraction
        onAnalysisComplete?.(parsed);
      }
    } catch (e) {
      const errorMsg = (e as Error).message;
      setJsonError(`Failed to save: ${errorMsg}`);
      onError(`Failed to save relationship analysis: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle auto analysis
  const handleAutoAnalyze = async () => {
    if (totalQuotes === 0) {
      onError('No analysis results to analyze. Run L-1 Analysis first.');
      return;
    }

    try {
      setIsAnalyzing(true);
      const result = await relationshipApi.analyze(projectId, beneficiaryName || undefined);

      if (result.success && result.graph) {
        setGraph(result.graph);
        onSuccess(`Analyzed relationships: ${result.graph.entities.length} entities, ${result.graph.relations.length} relations`);
        // Notify parent of analysis completion for entity name extraction
        onAnalysisComplete?.(result.graph);
      }
    } catch (error) {
      console.error('Relationship analysis failed:', error);
      onError('Relationship analysis failed. Check your API connection.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getEntityTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      person: 'bg-blue-100 text-blue-800',
      company: 'bg-green-100 text-green-800',
      position: 'bg-purple-100 text-purple-800',
      amount: 'bg-yellow-100 text-yellow-800',
      date: 'bg-gray-100 text-gray-800',
    };
    return colors[type.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  const getStrengthColor = (strength: string) => {
    const colors: Record<string, string> = {
      strong: 'bg-green-100 text-green-800 border-green-300',
      moderate: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      weak: 'bg-red-100 text-red-800 border-red-300',
    };
    return colors[strength.toLowerCase()] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getRelationTypeLabel = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Relationship Analysis</h3>
              {graph && (
                <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                  {graph.entities.length} entities
                </span>
              )}
            </div>
            {/* Beneficiary display */}
            <div className="text-xs text-gray-600">
              {beneficiaryName ? (
                <span>Beneficiary: <strong className="text-gray-900">{beneficiaryName}</strong></span>
              ) : (
                <span className="text-yellow-600">Set beneficiary name in header</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab switcher */}
            <div className="flex bg-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('manual')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'manual'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Manual
              </button>
              <button
                onClick={() => setActiveTab('auto')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'auto'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Auto
              </button>
            </div>
            {/* Collapse button */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg
                className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {activeTab === 'manual' ? (
            /* Manual Tab */
            <div className="space-y-4">
              {/* Step 1: One-Click Copy */}
              <div className="border-2 border-purple-200 bg-purple-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Step 1: Copy to LLM</h4>
                    <p className="text-xs text-gray-600 mt-1">
                      Copy prompt + all analysis quotes. Paste directly into ChatGPT/Claude.
                    </p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(getCombinedPrompt())}
                    disabled={totalQuotes === 0}
                    className="px-5 py-2.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                  >
                    {copiedCombined ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Prompt + Analysis
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
                  <span className="px-2 py-0.5 bg-white rounded border border-gray-200">
                    {totalQuotes} quotes from {Object.keys(quotesByStandard).length} standards
                  </span>
                  <span className="px-2 py-0.5 bg-white rounded border border-gray-200">
                    ~{Math.round(getCombinedPrompt().length / 4)} tokens
                  </span>
                </div>
              </div>

              {/* Preview: Analysis Results */}
              <details className="border border-gray-200 rounded-lg overflow-hidden">
                <summary className="px-4 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer text-sm font-semibold text-gray-900 hover:bg-gray-100">
                  Preview: Analysis Results ({totalQuotes} quotes)
                </summary>
                <div className="p-3">
                  <div className="bg-gray-100 rounded p-3 max-h-48 overflow-y-auto border border-gray-200">
                    <pre className="text-xs text-gray-900 whitespace-pre-wrap font-mono leading-relaxed">
                      {totalQuotes > 0
                        ? formatAnalysisResults(quotesByStandard)
                        : 'No analysis results yet. Run L-1 Analysis first.'}
                    </pre>
                  </div>
                </div>
              </details>

              {/* Step 2: Paste Result */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">Step 2: Paste LLM Result</span>
                  <div className="flex items-center gap-2">
                    {jsonError ? (
                      <span className="text-sm text-red-600 font-medium">{jsonError}</span>
                    ) : pastedResult.trim() && !jsonError ? (
                      <span className="text-sm text-green-600 font-medium">Valid JSON</span>
                    ) : null}
                  </div>
                </div>
                <div className="p-3">
                  <textarea
                    value={pastedResult}
                    onChange={(e) => handlePasteChange(e.target.value)}
                    placeholder={`Paste the JSON result from LLM here...

{
  "entities": [...],
  "relations": [...],
  "evidence_chains": [...]
}`}
                    className="w-full h-40 p-3 text-sm font-mono border border-gray-300 rounded resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder:text-gray-500"
                  />
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={handleSaveManual}
                      disabled={!pastedResult.trim() || !!jsonError || isSaving}
                      className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Saving...
                        </>
                      ) : (
                        'Save Analysis'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Auto Tab */
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-800 mb-4">
                  Automatically analyze relationships using LLM API. This will use the {totalQuotes} quotes from Analysis Results.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={handleAutoAnalyze}
                    disabled={isAnalyzing || totalQuotes === 0}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Analyze Relationships
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Results Display */}
          {graph && (
            <div className="border-t border-gray-200 pt-4 space-y-4">
              <h4 className="text-sm font-semibold text-gray-900">Results</h4>

              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setActiveResultTab('entities')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeResultTab === 'entities'
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Entities ({graph.entities.length})
                </button>
                <button
                  onClick={() => setActiveResultTab('relations')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeResultTab === 'relations'
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Relations ({graph.relations.length})
                </button>
                <button
                  onClick={() => setActiveResultTab('chains')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeResultTab === 'chains'
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Evidence Chains ({graph.evidence_chains.length})
                </button>
              </div>

              {/* Entities Tab */}
              {activeResultTab === 'entities' && (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {graph.entities.length === 0 ? (
                    <p className="text-sm text-gray-600 text-center py-4">No entities found</p>
                  ) : (
                    graph.entities.map((entity, index) => (
                      <div
                        key={entity.id || index}
                        className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${getEntityTypeColor(entity.type)}`}>
                          {entity.type}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{entity.name}</div>
                          {entity.documents && entity.documents.length > 0 && (
                            <div className="text-xs text-gray-600 mt-1">
                              Found in: {entity.documents.slice(0, 3).join(', ')}
                              {entity.documents.length > 3 && ` +${entity.documents.length - 3} more`}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Relations Tab */}
              {activeResultTab === 'relations' && (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {graph.relations.length === 0 ? (
                    <p className="text-sm text-gray-600 text-center py-4">No relations found</p>
                  ) : (
                    graph.relations.map((relation, index) => {
                      const sourceEntity = graph.entities.find(e => e.id === relation.source_id);
                      const targetEntity = graph.entities.find(e => e.id === relation.target_id);
                      return (
                        <div
                          key={index}
                          className="p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-gray-900">
                              {sourceEntity?.name || relation.source_id}
                            </span>
                            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                              {getRelationTypeLabel(relation.relation_type)}
                            </span>
                            <span className="font-medium text-gray-900">
                              {targetEntity?.name || relation.target_id}
                            </span>
                          </div>
                          {relation.description && (
                            <p className="text-xs text-gray-700 mt-2">{relation.description}</p>
                          )}
                          {relation.evidence && relation.evidence.length > 0 && (
                            <div className="text-xs text-gray-600 mt-1">
                              Evidence: {relation.evidence.slice(0, 2).join(', ')}
                              {relation.evidence.length > 2 && ` +${relation.evidence.length - 2} more`}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Evidence Chains Tab */}
              {activeResultTab === 'chains' && (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {graph.evidence_chains.length === 0 ? (
                    <p className="text-sm text-gray-600 text-center py-4">No evidence chains found</p>
                  ) : (
                    graph.evidence_chains.map((chain, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border ${getStrengthColor(chain.strength)}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium text-gray-900">{chain.claim}</div>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStrengthColor(chain.strength)}`}>
                            {chain.strength}
                          </span>
                        </div>
                        {chain.reasoning && (
                          <p className="text-xs text-gray-700 mt-2">{chain.reasoning}</p>
                        )}
                        {chain.documents && chain.documents.length > 0 && (
                          <div className="text-xs text-gray-600 mt-2">
                            Documents: {chain.documents.slice(0, 3).join(', ')}
                            {chain.documents.length > 3 && ` +${chain.documents.length - 3} more`}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!graph && !isAnalyzing && activeTab === 'auto' && (
            <div className="text-center py-6 text-gray-600">
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <p className="text-sm">
                Click "Analyze Relationships" to discover entities and their connections.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Documents must be analyzed first (L-1 Analysis).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
