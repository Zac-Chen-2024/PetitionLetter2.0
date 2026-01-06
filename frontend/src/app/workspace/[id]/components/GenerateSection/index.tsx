'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Quote, Citation, ParagraphVersion } from '@/types';
import { SECTION_TYPES, generateSectionWritingPrompt } from '@/utils/prompts';
import { writingApi } from '@/utils/api';

interface GenerateSectionProps {
  projectId: string;
  quotesByStandard: Record<string, Quote[]>;
  beneficiaryName: string;
  petitionerName: string;
  foreignEntityName: string;
  onPetitionerChange: (name: string) => void;
  onForeignEntityChange: (name: string) => void;
  onEntitySave: () => void;
  onViewQuote?: (quote: Quote) => void;
}

type TabType = 'manual' | 'auto';

// Get all quotes
function getAllQuotes(quotesByStandard: Record<string, Quote[]>): Quote[] {
  return Object.values(quotesByStandard).flat();
}

// Format quotes for prompt
function formatQuotesForPrompt(quotes: Quote[]): string {
  const formatted = quotes.map(q => ({
    quote: q.quote,
    relevance: q.relevance,
    l1_standard: q.standard_en || q.standard || 'unknown',
    source: {
      exhibit_id: q.source.exhibit_id,
      file_name: q.source.file_name,
    },
  }));
  return JSON.stringify(formatted, null, 2);
}

export default function GenerateSection({
  projectId,
  quotesByStandard,
  beneficiaryName,
  petitionerName,
  foreignEntityName,
  onPetitionerChange,
  onForeignEntityChange,
  onEntitySave,
  onViewQuote,
}: GenerateSectionProps) {
  const [activeTab, setActiveTab] = useState<TabType>('manual');
  const [selectedSection, setSelectedSection] = useState(SECTION_TYPES[0].key);
  const [versionsBySection, setVersionsBySection] = useState<Record<string, ParagraphVersion[]>>({});
  const [currentVersionIdBySection, setCurrentVersionIdBySection] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Manual mode state
  const [pastedResult, setPastedResult] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Get versions for current section
  const versions = versionsBySection[selectedSection] || [];
  const currentVersionId = currentVersionIdBySection[selectedSection] || null;
  const currentVersion = versions.find(v => v.id === currentVersionId);

  const allQuotes = getAllQuotes(quotesByStandard);
  const totalQuotes = allQuotes.length;

  // Load saved writing on mount
  useEffect(() => {
    loadSavedWriting();
  }, [projectId]);

  const loadSavedWriting = async () => {
    try {
      setIsLoading(true);
      const result = await writingApi.getAllWriting(projectId);
      if (result?.sections) {
        const newVersionsBySection: Record<string, ParagraphVersion[]> = {};
        const newCurrentVersionIdBySection: Record<string, string | null> = {};

        for (const [sectionKey, data] of Object.entries(result.sections)) {
          const sectionData = data as { text: string; citations: Citation[]; timestamp: string; version_id: string };
          const version: ParagraphVersion = {
            id: sectionData.version_id || `saved-${sectionKey}`,
            version: 1,
            text: sectionData.text,
            citations: sectionData.citations || [],
            created_at: sectionData.timestamp || new Date().toISOString(),
          };
          newVersionsBySection[sectionKey] = [version];
          newCurrentVersionIdBySection[sectionKey] = version.id;
        }

        setVersionsBySection(newVersionsBySection);
        setCurrentVersionIdBySection(newCurrentVersionIdBySection);
      }
    } catch {
      console.log('No saved writing yet');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate combined prompt
  const getCombinedPrompt = useCallback(() => {
    const evidence = formatQuotesForPrompt(allQuotes);
    return generateSectionWritingPrompt(selectedSection, evidence, {
      petitionerName,
      foreignEntityName,
      beneficiaryName,
    });
  }, [selectedSection, beneficiaryName, petitionerName, foreignEntityName, allQuotes]);

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Validate JSON
  const validateJSON = (jsonStr: string) => {
    if (!jsonStr.trim()) {
      setJsonError(null);
      return;
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.paragraph_text && parsed.citations_used) {
        setJsonError(null);
      } else {
        setJsonError('Invalid format: expected { paragraph_text, citations_used }');
      }
    } catch (e) {
      setJsonError(`JSON Parse Error: ${(e as Error).message}`);
    }
  };

  const handlePasteChange = (value: string) => {
    setPastedResult(value);
    validateJSON(value);
  };

  const addVersionToSection = (newVersion: ParagraphVersion) => {
    setVersionsBySection(prev => ({
      ...prev,
      [selectedSection]: [...(prev[selectedSection] || []), newVersion],
    }));
    setCurrentVersionIdBySection(prev => ({
      ...prev,
      [selectedSection]: newVersion.id,
    }));
  };

  // Save manual result
  const handleSaveManual = async () => {
    if (!pastedResult.trim() || jsonError || isSaving) return;

    try {
      setIsSaving(true);
      const parsed = JSON.parse(pastedResult);

      const result = await writingApi.saveManual(
        projectId,
        selectedSection,
        parsed.paragraph_text,
        parsed.citations_used || []
      );

      if (result.success) {
        const newVersion: ParagraphVersion = {
          id: `v${Date.now()}`,
          version: versions.length + 1,
          text: parsed.paragraph_text,
          citations: parsed.citations_used || [],
          created_at: new Date().toISOString(),
        };
        addVersionToSection(newVersion);
        setPastedResult('');
      }
    } catch (e) {
      setJsonError(`Failed to save: ${(e as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto generate
  const handleAutoGenerate = async () => {
    try {
      setIsGenerating(true);
      const result = await writingApi.generateParagraph(projectId, selectedSection, beneficiaryName || undefined);

      if (result.success) {
        const newVersion: ParagraphVersion = {
          id: `v${Date.now()}`,
          version: versions.length + 1,
          text: result.paragraph.text,
          citations: result.paragraph.citations,
          created_at: new Date().toISOString(),
        };
        addVersionToSection(newVersion);
      }
    } catch (error) {
      console.error('Generate failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Render paragraph with citation highlighting
  const renderParagraphWithCitations = (text: string) => {
    const regex = /\[Exhibit ([A-Z]-\d+)(?::\s*([^\]]+))?\]/g;
    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const exhibitId = match[1];
      const title = match[2];
      const citation = currentVersion?.citations.find(c => c.exhibit === exhibitId);

      parts.push(
        <span key={match.index} className="relative group inline-block">
          <span className="text-blue-600 cursor-pointer hover:bg-blue-50 px-0.5 rounded font-medium">
            [Exhibit {exhibitId}{title ? `: ${title}` : ''}]
          </span>
          {citation && (
            <div className="absolute z-50 bottom-full left-0 mb-2 w-72 bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="absolute -bottom-2 left-4 w-4 h-4 bg-white border-r border-b border-[#E5E7EB] transform rotate-45"></div>
              <div className="relative">
                <div className="font-medium text-sm text-[#1A1A1A] mb-1">Exhibit {exhibitId}</div>
                <div className="text-xs text-[#6B7280] mb-2">{citation.file_name}</div>
                <div className="text-xs text-[#1A1A1A] italic line-clamp-3">"{citation.quote}"</div>
              </div>
            </div>
          )}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-12 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
        <span className="ml-3 text-[#6B7280]">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Config Card */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 space-y-4">
        {/* Section Selector */}
        <div className="flex items-center gap-4">
          <label className="text-sm text-[#6B7280] font-medium">Section:</label>
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="flex-1 max-w-md px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A1A] bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {SECTION_TYPES.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <span className="text-sm text-[#6B7280]">{totalQuotes} quotes available</span>
        </div>

        {/* Entity Names */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[#6B7280]">Petitioner (US):</label>
            <input
              type="text"
              value={petitionerName}
              onChange={(e) => onPetitionerChange(e.target.value)}
              onBlur={onEntitySave}
              placeholder="e.g., ABC Corp."
              className="w-40 px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A1A] bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-[#6B7280]">Foreign Entity:</label>
            <input
              type="text"
              value={foreignEntityName}
              onChange={(e) => onForeignEntityChange(e.target.value)}
              onBlur={onEntitySave}
              placeholder="e.g., XYZ Ltd."
              className="w-40 px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A1A] bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {beneficiaryName && (
            <span className="text-sm text-[#6B7280]">
              Beneficiary: <strong className="text-[#1A1A1A]">{beneficiaryName}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'manual'
              ? 'bg-white text-[#1A1A1A] shadow-sm'
              : 'text-[#6B7280] hover:text-[#1A1A1A]'
          }`}
        >
          Manual (Copy & Paste)
        </button>
        <button
          onClick={() => setActiveTab('auto')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'auto'
              ? 'bg-white text-[#1A1A1A] shadow-sm'
              : 'text-[#6B7280] hover:text-[#1A1A1A]'
          }`}
        >
          Auto Generate
        </button>
      </div>

      {/* Manual Mode */}
      {activeTab === 'manual' && (
        <div className="space-y-6">
          {/* Step 1: Copy Prompt */}
          <div className="bg-white rounded-xl border-2 border-green-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-[#1A1A1A] mb-1">Step 1: Copy to LLM</h4>
                <p className="text-sm text-[#6B7280]">
                  Copy prompt + evidence for "{SECTION_TYPES.find(s => s.key === selectedSection)?.label}". Paste into ChatGPT/Claude.
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(getCombinedPrompt())}
                disabled={totalQuotes === 0}
                className="px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {copiedPrompt ? (
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
                    Copy Prompt
                  </>
                )}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-[#6B7280]">
              <span className="px-2 py-1 bg-gray-100 rounded">{totalQuotes} quotes</span>
              <span className="px-2 py-1 bg-gray-100 rounded">~{Math.round(getCombinedPrompt().length / 4)} tokens</span>
            </div>
          </div>

          {/* Step 2: Paste Result */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-[#E5E7EB] flex items-center justify-between">
              <span className="font-semibold text-[#1A1A1A]">Step 2: Paste LLM Result</span>
              {jsonError ? (
                <span className="text-sm text-red-600">{jsonError}</span>
              ) : pastedResult.trim() ? (
                <span className="text-sm text-green-600">Valid JSON</span>
              ) : null}
            </div>
            <div className="p-5">
              <textarea
                value={pastedResult}
                onChange={(e) => handlePasteChange(e.target.value)}
                placeholder={`Paste the JSON result from LLM here...

{
  "paragraph_text": "...",
  "citations_used": [...]
}`}
                className="w-full h-40 p-4 text-sm font-mono border border-[#E5E7EB] rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-[#1A1A1A] placeholder:text-gray-400"
              />
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleSaveManual}
                  disabled={!pastedResult.trim() || !!jsonError || isSaving}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Paragraph'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto Mode */}
      {activeTab === 'auto' && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
          <p className="text-sm text-[#6B7280] mb-4">
            Automatically generate paragraph using LLM API. The AI will select relevant quotes from all {totalQuotes} available quotes.
          </p>
          <button
            onClick={handleAutoGenerate}
            disabled={isGenerating || totalQuotes === 0}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Paragraph
              </>
            )}
          </button>
        </div>
      )}

      {/* Generated Paragraph Display */}
      {currentVersion && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-[#E5E7EB] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-[#1A1A1A]">Generated Paragraph</span>
              <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">v{currentVersion.version}</span>
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(currentVersion.text);
              }}
              className="text-sm text-[#6B7280] hover:text-[#1A1A1A] flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <div className="p-5">
            <div className="text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">
              {renderParagraphWithCitations(currentVersion.text)}
            </div>
          </div>
          {currentVersion.citations.length > 0 && (
            <div className="px-5 py-4 bg-gray-50 border-t border-[#E5E7EB]">
              <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
                Citations ({currentVersion.citations.length})
              </h4>
              <div className="space-y-2">
                {currentVersion.citations.map((citation, idx) => (
                  <div key={idx} className="text-xs bg-white rounded-lg p-3 border border-[#E5E7EB]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-blue-600">[Exhibit {citation.exhibit}]</span>
                      <span className="text-[#6B7280]">{citation.file_name}</span>
                    </div>
                    <div className="text-[#6B7280] italic line-clamp-2">"{citation.quote}"</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!currentVersion && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#6B7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[#1A1A1A] mb-2">No Paragraph Yet</h3>
          <p className="text-[#6B7280]">
            Use Manual mode to copy prompt to ChatGPT, or Auto mode to generate directly.
          </p>
        </div>
      )}
    </div>
  );
}
