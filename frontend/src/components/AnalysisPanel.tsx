'use client';

import { useState, useCallback } from 'react';
import type { Document, Quote } from '@/types';
import { generateAnalysisPrompt, generateCombinedPrompt } from '@/utils/prompts';

interface AnalysisPanelProps {
  documents: Document[];
  selectedDocs: string[];
  onAnalysisComplete: (results: DocumentAnalysisResult[]) => void;
  onAutoAnalyze: (docIds: string[]) => Promise<void>;
  isAnalyzing?: boolean;
}

interface DocumentAnalysisResult {
  document_id: string;
  exhibit_id: string;
  file_name: string;
  quotes: Quote[];
}

type TabType = 'manual' | 'auto';

export default function AnalysisPanel({
  documents,
  selectedDocs,
  onAnalysisComplete,
  onAutoAnalyze,
  isAnalyzing = false,
}: AnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('manual');
  const [selectedDocForManual, setSelectedDocForManual] = useState<string>('');
  const [pastedResult, setPastedResult] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [parsedQuotes, setParsedQuotes] = useState<number>(0);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedOCR, setCopiedOCR] = useState(false);
  const [copiedCombined, setCopiedCombined] = useState(false);

  // Get the selected document for manual analysis
  const selectedDoc = documents.find(d => d.id === selectedDocForManual);

  // Generate prompt for the selected document (without OCR text for display)
  const getPrompt = useCallback(() => {
    if (!selectedDoc) return '';
    return generateAnalysisPrompt({
      exhibitId: selectedDoc.exhibit_number || 'X-1',
      fileName: selectedDoc.file_name,
      documentText: '', // Empty for display preview
    });
  }, [selectedDoc]);

  // Generate combined prompt + OCR for one-click copy
  const getCombinedPrompt = useCallback(() => {
    if (!selectedDoc) return '';
    return generateCombinedPrompt({
      exhibitId: selectedDoc.exhibit_number || 'X-1',
      fileName: selectedDoc.file_name,
      documentText: selectedDoc.ocr_text || '',
    });
  }, [selectedDoc]);

  // Copy to clipboard
  const copyToClipboard = async (text: string, type: 'prompt' | 'ocr' | 'combined') => {
    await navigator.clipboard.writeText(text);
    if (type === 'prompt') {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } else if (type === 'ocr') {
      setCopiedOCR(true);
      setTimeout(() => setCopiedOCR(false), 2000);
    } else {
      setCopiedCombined(true);
      setTimeout(() => setCopiedCombined(false), 2000);
    }
  };

  // Validate and parse JSON
  const validateJSON = (jsonStr: string) => {
    if (!jsonStr.trim()) {
      setJsonError(null);
      setParsedQuotes(0);
      return;
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const quotes = parsed.quotes || parsed;
      if (Array.isArray(quotes)) {
        setJsonError(null);
        setParsedQuotes(quotes.length);
      } else if (Array.isArray(parsed)) {
        setJsonError(null);
        setParsedQuotes(parsed.length);
      } else {
        setJsonError('Invalid format: expected { "quotes": [...] } or [...]');
        setParsedQuotes(0);
      }
    } catch (e) {
      setJsonError(`JSON Parse Error: ${(e as Error).message}`);
      setParsedQuotes(0);
    }
  };

  // Handle paste result change
  const handlePasteChange = (value: string) => {
    setPastedResult(value);
    validateJSON(value);
  };

  // Save manual analysis
  const handleSaveManual = () => {
    if (!selectedDoc || !pastedResult.trim() || jsonError) return;

    try {
      const parsed = JSON.parse(pastedResult);
      const quotes = parsed.quotes || parsed;

      // Auto-fill source info for each quote (in case LLM didn't include it)
      const enrichedQuotes = (Array.isArray(quotes) ? quotes : []).map((q: Quote) => ({
        ...q,
        source: {
          exhibit_id: q.source?.exhibit_id || selectedDoc.exhibit_number || 'X-1',
          file_name: q.source?.file_name || selectedDoc.file_name,
        },
      }));

      const result: DocumentAnalysisResult = {
        document_id: selectedDoc.id,
        exhibit_id: selectedDoc.exhibit_number || 'X-1',
        file_name: selectedDoc.file_name,
        quotes: enrichedQuotes,
      };

      onAnalysisComplete([result]);
      setPastedResult('');
      setParsedQuotes(0);
    } catch (e) {
      setJsonError(`Failed to save: ${(e as Error).message}`);
    }
  };

  // Handle auto analysis
  const handleAutoAnalyze = () => {
    const docsToAnalyze = selectedDocs.length > 0
      ? selectedDocs
      : documents.filter(d => d.ocr_status === 'completed').map(d => d.id);

    if (docsToAnalyze.length === 0) return;
    onAutoAnalyze(docsToAnalyze);
  };

  const completedDocs = documents.filter(d => d.ocr_status === 'completed');

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header with tabs and document selector */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-semibold text-gray-900">L-1 Analysis</h3>
            {/* Document selector in header */}
            <select
              value={selectedDocForManual}
              onChange={(e) => setSelectedDocForManual(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-900 font-medium min-w-[280px]"
            >
              <option value="" className="text-gray-900">Select document...</option>
              {completedDocs.map(doc => (
                <option key={doc.id} value={doc.id} className="text-gray-900">
                  {doc.exhibit_number || 'X-?'}: {doc.file_name.substring(0, 40)}{doc.file_name.length > 40 ? '...' : ''}
                </option>
              ))}
            </select>
          </div>
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
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'manual' ? (
          <div className="space-y-4">
            {/* One-Click Copy Button - Most prominent */}
            <div className="border-2 border-purple-200 bg-purple-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Step 1: Copy to LLM</h4>
                  <p className="text-xs text-gray-600 mt-1">
                    One click to copy both prompt instructions and OCR text. Paste directly into ChatGPT/Claude.
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(getCombinedPrompt(), 'combined')}
                  disabled={!selectedDoc?.ocr_text}
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
                      Copy Prompt + OCR
                    </>
                  )}
                </button>
              </div>
              {selectedDoc && (
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
                  <span className="px-2 py-0.5 bg-white rounded border border-gray-200">
                    Exhibit: {selectedDoc.exhibit_number}
                  </span>
                  <span className="px-2 py-0.5 bg-white rounded border border-gray-200">
                    Pages: {selectedDoc.page_count}
                  </span>
                  <span className="px-2 py-0.5 bg-white rounded border border-gray-200">
                    ~{Math.round((selectedDoc.ocr_text?.length || 0) / 4)} tokens
                  </span>
                </div>
              )}
            </div>

            {/* Preview Section - Collapsible */}
            <details className="border border-gray-200 rounded-lg overflow-hidden">
              <summary className="px-4 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer text-sm font-semibold text-gray-900 hover:bg-gray-100">
                Preview: Prompt Template
              </summary>
              <div className="p-3">
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => copyToClipboard(getPrompt(), 'prompt')}
                    disabled={!selectedDoc}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
                  >
                    {copiedPrompt ? 'Copied!' : 'Copy Prompt Only'}
                  </button>
                </div>
                <div className="bg-gray-100 rounded p-3 max-h-48 overflow-y-auto border border-gray-200">
                  <pre className="text-sm text-gray-900 whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedDoc ? getPrompt() : 'Select a document from the dropdown above to see the prompt'}
                  </pre>
                </div>
              </div>
            </details>

            <details className="border border-gray-200 rounded-lg overflow-hidden">
              <summary className="px-4 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer text-sm font-semibold text-gray-900 hover:bg-gray-100">
                Preview: OCR Text
              </summary>
              <div className="p-3">
                {selectedDoc ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                        <span>Exhibit: {selectedDoc.exhibit_number}</span>
                        <span className="text-gray-400">|</span>
                        <span>Pages: {selectedDoc.page_count}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(selectedDoc?.ocr_text || '', 'ocr')}
                        disabled={!selectedDoc?.ocr_text}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
                      >
                        {copiedOCR ? 'Copied!' : 'Copy OCR Only'}
                      </button>
                    </div>
                    <div className="bg-gray-100 rounded p-3 max-h-48 overflow-y-auto border border-gray-200">
                      <pre className="text-sm text-gray-900 whitespace-pre-wrap font-mono leading-relaxed">
                        {selectedDoc.ocr_text || 'No OCR text available'}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-600 text-center py-4 font-medium">
                    Select a document from the dropdown above to view its OCR text
                  </div>
                )}
              </div>
            </details>

            {/* Step 2: Paste Result */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">Step 2: Paste LLM Result</span>
                <div className="flex items-center gap-2">
                  {jsonError ? (
                    <span className="text-sm text-red-600 font-medium">{jsonError}</span>
                  ) : parsedQuotes > 0 ? (
                    <span className="text-sm text-green-600 font-medium">Valid JSON - {parsedQuotes} quotes found</span>
                  ) : null}
                </div>
              </div>
              <div className="p-3">
                <textarea
                  value={pastedResult}
                  onChange={(e) => handlePasteChange(e.target.value)}
                  placeholder='Paste the JSON result from LLM here...

{
  "quotes": [
    {
      "standard": "合格的公司关系",
      "standard_key": "qualifying_relationship",
      ...
    }
  ]
}'
                  className="w-full h-40 p-3 text-sm font-mono border border-gray-300 rounded resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-500"
                />
                <div className="flex justify-end mt-3">
                  <button
                    onClick={handleSaveManual}
                    disabled={!selectedDoc || !pastedResult.trim() || !!jsonError}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Save Analysis
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Auto Tab */
          <div className="space-y-4">
            <p className="text-sm text-gray-800">
              Select documents to analyze automatically using LLM API. This will cost API credits.
            </p>

            {/* Document selection for auto */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-900">
                  Documents to Analyze
                </span>
                <span className="text-sm text-gray-700 font-medium">
                  {selectedDocs.length > 0 ? `${selectedDocs.length} selected` : `All ${completedDocs.length} documents`}
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {completedDocs.map(doc => (
                  <label key={doc.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(doc.id)}
                      onChange={() => {/* handled by parent */}}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300"
                      disabled
                    />
                    <span className="font-mono text-blue-700 font-medium">{doc.exhibit_number || 'X-?'}</span>
                    <span className="text-gray-900 truncate">{doc.file_name}</span>
                  </label>
                ))}
              </div>
              <p className="text-sm text-gray-700 mt-3">
                Use the document table above to select specific documents, or leave empty to analyze all.
              </p>
            </div>

            {/* Start button */}
            <div className="flex justify-end">
              <button
                onClick={handleAutoAnalyze}
                disabled={isAnalyzing || completedDocs.length === 0}
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Start Analysis
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
