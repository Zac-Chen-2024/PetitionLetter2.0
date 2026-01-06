'use client';

import { useState, useCallback, useEffect } from 'react';
import type { ParagraphVersion, Citation, Quote } from '@/types';
import { SECTION_TYPES, generateSectionWritingPrompt } from '@/utils/prompts';
import { writingApi, StyleTemplate } from '@/utils/api';
import StyleTemplatePanel from './StyleTemplatePanel';

interface ParagraphGeneratorProps {
  projectId: string;
  onGenerate: (sectionType: string, beneficiaryName?: string) => Promise<{
    text: string;
    citations: Citation[];
  }>;
  isGenerating?: boolean;
  beneficiaryName?: string;
  quotesByStandard: Record<string, Quote[]>;
  // Entity names from relationship analysis
  initialPetitionerName?: string;
  initialForeignEntityName?: string;
  // Callback when entity names are edited
  onEntityNamesChange?: (petitionerName: string, foreignEntityName: string) => void;
}

type TabType = 'manual' | 'auto';

// Get all quotes from all standards
function getAllQuotes(quotesByStandard: Record<string, Quote[]>): Quote[] {
  const quotes: Quote[] = [];
  for (const standard of Object.keys(quotesByStandard)) {
    if (quotesByStandard[standard]) {
      quotes.push(...quotesByStandard[standard]);
    }
  }
  return quotes;
}

// Format quotes as JSON for the prompt - include standard/category info
function formatQuotesForPrompt(quotes: Quote[]): string {
  const formatted = quotes.map(q => ({
    quote: q.quote,
    relevance: q.relevance,
    l1_standard: q.standard_en || q.standard || 'unknown',  // Include L-1 standard in English
    source: {
      exhibit_id: q.source.exhibit_id,
      file_name: q.source.file_name
    }
  }));
  return JSON.stringify(formatted, null, 2);
}

export default function ParagraphGenerator({
  projectId,
  onGenerate,
  isGenerating = false,
  beneficiaryName = '',
  quotesByStandard,
  initialPetitionerName = '',
  initialForeignEntityName = '',
  onEntityNamesChange,
}: ParagraphGeneratorProps) {
  const [activeTab, setActiveTab] = useState<TabType>('manual');
  const [selectedSection, setSelectedSection] = useState(SECTION_TYPES[0].key);
  const [versionsBySection, setVersionsBySection] = useState<Record<string, ParagraphVersion[]>>({});
  const [currentVersionIdBySection, setCurrentVersionIdBySection] = useState<Record<string, string | null>>({});
  const [revisionInput, setRevisionInput] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Entity names for prompts - initialized from props
  const [petitionerName, setPetitionerName] = useState(initialPetitionerName);
  const [foreignEntityName, setForeignEntityName] = useState(initialForeignEntityName);

  // Get versions for current section
  const versions = versionsBySection[selectedSection] || [];
  const currentVersionId = currentVersionIdBySection[selectedSection] || null;

  // Load saved writing results on mount
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
    } catch (error) {
      console.log('No saved writing yet');
    } finally {
      setIsLoading(false);
    }
  };

  // Update state when props change (from relationship analysis)
  useEffect(() => {
    if (initialPetitionerName) {
      setPetitionerName(initialPetitionerName);
    }
  }, [initialPetitionerName]);

  useEffect(() => {
    if (initialForeignEntityName) {
      setForeignEntityName(initialForeignEntityName);
    }
  }, [initialForeignEntityName]);

  // Handle entity name change with save callback
  const handlePetitionerChange = (value: string) => {
    setPetitionerName(value);
  };

  const handleForeignEntityChange = (value: string) => {
    setForeignEntityName(value);
  };

  // Save entity names on blur
  const handleEntityNameBlur = () => {
    onEntityNamesChange?.(petitionerName, foreignEntityName);
  };

  // Manual mode state
  const [pastedResult, setPastedResult] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copiedCombined, setCopiedCombined] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Style template state
  const [activeTemplate, setActiveTemplate] = useState<StyleTemplate | null>(null);

  // Get current version
  const currentVersion = versions.find(v => v.id === currentVersionId);

  // Get all quotes - let LLM pick the relevant ones for the section
  const allQuotes = getAllQuotes(quotesByStandard);
  const totalQuotes = allQuotes.length;

  // Generate combined prompt + evidence using section-specific prompts
  const getCombinedPrompt = useCallback(() => {
    const evidence = formatQuotesForPrompt(allQuotes);

    // Parse style template if active
    let styleTemplateStr: string | undefined;
    if (activeTemplate) {
      try {
        const parsed = JSON.parse(activeTemplate.parsed_structure);
        styleTemplateStr = parsed.template;
      } catch {
        styleTemplateStr = activeTemplate.parsed_structure;
      }
    }

    return generateSectionWritingPrompt(selectedSection, evidence, {
      petitionerName,
      foreignEntityName,
      beneficiaryName,
    }, styleTemplateStr);
  }, [selectedSection, beneficiaryName, petitionerName, foreignEntityName, allQuotes, activeTemplate]);

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
      if (parsed.paragraph_text && parsed.citations_used) {
        setJsonError(null);
      } else {
        setJsonError('Invalid format: expected { paragraph_text, citations_used }');
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

  // Helper to update versions for current section
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

      // Save to backend
      const result = await writingApi.saveManual(
        projectId,
        selectedSection,
        parsed.paragraph_text,
        parsed.citations_used || []
      );

      if (result.success) {
        // Create new version
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
      const errorMsg = (e as Error).message;
      setJsonError(`Failed to save: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Generate new version (auto mode)
  const handleGenerate = async () => {
    try {
      const result = await onGenerate(selectedSection, beneficiaryName || undefined);

      const newVersion: ParagraphVersion = {
        id: `v${Date.now()}`,
        version: versions.length + 1,
        text: result.text,
        citations: result.citations,
        created_at: new Date().toISOString(),
      };

      addVersionToSection(newVersion);
    } catch (error) {
      console.error('Generate failed:', error);
    }
  };

  // Regenerate with instructions (simulated - in real app would call API)
  const handleRegenerate = async () => {
    if (!revisionInput.trim() || !currentVersion) return;

    try {
      // In real implementation, this would call API with revision instructions
      const result = await onGenerate(selectedSection, beneficiaryName || undefined);

      const newVersion: ParagraphVersion = {
        id: `v${Date.now()}`,
        version: versions.length + 1,
        text: result.text,
        citations: result.citations,
        created_at: new Date().toISOString(),
        revision_instruction: revisionInput,
      };

      addVersionToSection(newVersion);
      setRevisionInput('');
    } catch (error) {
      console.error('Regenerate failed:', error);
    }
  };

  // Switch version
  const switchVersion = (versionId: string) => {
    setCurrentVersionIdBySection(prev => ({
      ...prev,
      [selectedSection]: versionId,
    }));
    setShowVersionHistory(false);
  };

  // Copy paragraph to clipboard
  const copyParagraph = async () => {
    if (!currentVersion) return;
    await navigator.clipboard.writeText(currentVersion.text);
  };

  // Render exhibit references with hover effect
  const renderParagraphWithCitations = (text: string) => {
    // Match [Exhibit X-Y: Title] patterns
    const regex = /\[Exhibit ([A-Z]-\d+)(?::\s*([^\]]+))?\]/g;

    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      // Add citation as hoverable element
      const exhibitId = match[1];
      const title = match[2];
      const citation = currentVersion?.citations.find(c => c.exhibit === exhibitId);

      parts.push(
        <span
          key={match.index}
          className="relative group inline-block"
        >
          <span className="text-blue-600 cursor-pointer hover:bg-blue-50 px-0.5 rounded">
            [Exhibit {exhibitId}{title ? `: ${title}` : ''}]
          </span>

          {/* Hover tooltip */}
          <div className="absolute z-50 bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
            <div className="absolute -bottom-2 left-4 w-4 h-4 bg-white border-r border-b border-gray-200 transform rotate-45"></div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="font-medium text-sm text-gray-900">Exhibit {exhibitId}</span>
              </div>
              {citation && (
                <>
                  <div className="text-xs text-gray-500 mb-1">{citation.file_name}</div>
                  <div className="text-xs text-gray-600 line-clamp-3 italic">&ldquo;{citation.quote}&rdquo;</div>
                  {citation.claim && (
                    <div className="text-xs text-gray-500 mt-1">Supports: {citation.claim}</div>
                  )}
                </>
              )}
            </div>
          </div>
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Paragraph Generation</h3>
            {versions.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                {versions.length} version{versions.length > 1 ? 's' : ''}
              </span>
            )}
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

            {/* Version selector */}
            {versions.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowVersionHistory(!showVersionHistory)}
                  className="px-2 py-1 text-xs bg-gray-100 rounded flex items-center gap-1 hover:bg-gray-200"
                >
                  <span>v{currentVersion?.version || 1}</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Version dropdown */}
                {showVersionHistory && (
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                    <div className="p-2 border-b border-gray-100">
                      <span className="text-xs font-medium text-gray-700">Version History</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {versions.map(v => (
                        <button
                          key={v.id}
                          onClick={() => switchVersion(v.id)}
                          className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                            v.id === currentVersionId ? 'bg-blue-50 text-blue-600' : 'text-gray-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Version {v.version}</span>
                            {v.revision_instruction && (
                              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[10px]">
                                Revised
                              </span>
                            )}
                          </div>
                          <div className="text-gray-600 text-[10px] mt-0.5">
                            {new Date(v.created_at).toLocaleTimeString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Config */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 space-y-3">
        {/* Row 1: Section selector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-700 font-medium">Section:</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-900 bg-white"
            >
              {SECTION_TYPES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="text-xs text-gray-500">
            {totalQuotes} total quotes available
          </div>
        </div>

        {/* Row 2: Entity names */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-700 font-medium whitespace-nowrap">Petitioner (US):</label>
            <input
              type="text"
              value={petitionerName}
              onChange={(e) => handlePetitionerChange(e.target.value)}
              onBlur={handleEntityNameBlur}
              placeholder="e.g., ABC Corp."
              className="w-40 px-2 py-1 text-xs border border-gray-300 rounded text-gray-900 bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-700 font-medium whitespace-nowrap">Foreign Entity:</label>
            <input
              type="text"
              value={foreignEntityName}
              onChange={(e) => handleForeignEntityChange(e.target.value)}
              onBlur={handleEntityNameBlur}
              placeholder="e.g., XYZ Ltd."
              className="w-40 px-2 py-1 text-xs border border-gray-300 rounded text-gray-900 bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="text-xs text-gray-600">
            {beneficiaryName ? (
              <span>Beneficiary: <strong className="text-gray-900">{beneficiaryName}</strong></span>
            ) : (
              <span className="text-yellow-600">Set beneficiary name in header ↑</span>
            )}
          </div>
        </div>
      </div>

      {/* Style Template Panel */}
      <div className="px-4 pt-4">
        <StyleTemplatePanel
          selectedSection={selectedSection}
          onTemplateSelect={setActiveTemplate}
          activeTemplate={activeTemplate}
        />
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {activeTab === 'manual' ? (
          /* Manual Tab */
          <div className="space-y-4">
            {/* Step 1: One-Click Copy */}
            <div className="border-2 border-green-200 bg-green-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Step 1: Copy to LLM</h4>
                  <p className="text-xs text-gray-600 mt-1">
                    Copy prompt + evidence for "{SECTION_TYPES.find(s => s.key === selectedSection)?.label}". Paste into ChatGPT/Claude.
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(getCombinedPrompt())}
                  disabled={totalQuotes === 0}
                  className="px-5 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
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
                      Copy Prompt + Evidence
                    </>
                  )}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
                <span className="px-2 py-0.5 bg-white rounded border border-gray-200">
                  {totalQuotes} total quotes (LLM will select relevant ones)
                </span>
                <span className="px-2 py-0.5 bg-white rounded border border-gray-200">
                  ~{Math.round(getCombinedPrompt().length / 4)} tokens
                </span>
              </div>
            </div>

            {/* Preview: Evidence */}
            <details className="border border-gray-200 rounded-lg overflow-hidden">
              <summary className="px-4 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer text-sm font-semibold text-gray-900 hover:bg-gray-100">
                Preview: All Evidence ({totalQuotes} quotes)
              </summary>
              <div className="p-3">
                <div className="bg-gray-100 rounded p-3 max-h-48 overflow-y-auto border border-gray-200">
                  <pre className="text-xs text-gray-900 whitespace-pre-wrap font-mono leading-relaxed">
                    {totalQuotes > 0
                      ? formatQuotesForPrompt(allQuotes)
                      : 'No quotes available. Run L-1 Analysis first.'}
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
  "paragraph_text": "...",
  "citations_used": [...]
}`}
                  className="w-full h-40 p-3 text-sm font-mono border border-gray-300 rounded resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-900 placeholder:text-gray-500"
                />
                <div className="flex justify-end mt-3">
                  <button
                    onClick={handleSaveManual}
                    disabled={!pastedResult.trim() || !!jsonError || isSaving}
                    className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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
        ) : (
          /* Auto Tab */
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-800 mb-4">
                Automatically generate paragraph using LLM API. LLM will select relevant quotes from all {totalQuotes} available quotes for "{SECTION_TYPES.find(s => s.key === selectedSection)?.label}".
              </p>
              <div className="flex justify-end">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || totalQuotes === 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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
            </div>
          </div>
        )}

        {/* Generated paragraph display */}
        {currentVersion && (
          <div className="border-t border-gray-200 pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Generated Paragraph</h4>
              <button
                onClick={copyParagraph}
                className="px-3 py-1 text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1 hover:bg-gray-100 rounded"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
            </div>

            {/* Paragraph display */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {renderParagraphWithCitations(currentVersion.text)}
              </div>
            </div>

            {/* Revision input */}
            <div className="border-t border-gray-200 pt-4">
              <label className="text-xs text-gray-700 font-medium mb-2 block">Revision Instructions</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={revisionInput}
                  onChange={(e) => setRevisionInput(e.target.value)}
                  placeholder="e.g., Make it more formal, add more specific dates..."
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-900 bg-white placeholder:text-gray-500"
                />
                <button
                  onClick={handleRegenerate}
                  disabled={isGenerating || !revisionInput.trim()}
                  className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Enter instructions to revise the current version. This creates a new version based on your feedback.
              </p>
            </div>

            {/* Citations used */}
            {currentVersion.citations.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-xs font-semibold text-gray-800 mb-2">Citations Used ({currentVersion.citations.length})</h4>
                <div className="space-y-2">
                  {currentVersion.citations.map((citation, idx) => (
                    <div key={idx} className="text-xs bg-gray-50 rounded p-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-blue-600">[Exhibit {citation.exhibit}]</span>
                        <span className="text-gray-700">{citation.file_name}</span>
                      </div>
                      <div className="text-gray-700 mt-1 italic line-clamp-2">
                        &ldquo;{citation.quote}&rdquo;
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!currentVersion && activeTab === 'auto' && (
          <div className="text-center py-12 text-gray-700">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <p className="text-sm">No paragraph generated yet.</p>
            <p className="text-xs text-gray-600 mt-1">Select a section and click Generate to create a paragraph.</p>
          </div>
        )}
      </div>
    </div>
  );
}
