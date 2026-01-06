'use client';

import { useState } from 'react';
import type { Quote, Document } from '@/types';
import StandardView from './StandardView';
import MatrixView from './MatrixView';

interface AnalysisSectionProps {
  projectId: string;
  documents: Document[];
  selectedDocs: string[];
  quotesByStandard: Record<string, Quote[]>;
  onRunAnalysis: (docIds: string[]) => Promise<void>;
  isAnalyzing: boolean;
  onViewQuote?: (quote: Quote) => void;
}

type ViewMode = 'standard' | 'matrix';

export default function AnalysisSection({
  projectId,
  documents,
  selectedDocs,
  quotesByStandard,
  onRunAnalysis,
  isAnalyzing,
  onViewQuote,
}: AnalysisSectionProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('standard');

  const totalQuotes = Object.values(quotesByStandard).flat().length;
  const completedDocs = documents.filter(d => d.ocr_status === 'completed');
  const canAnalyze = selectedDocs.length > 0 || completedDocs.length > 0;

  const handleRunAnalysis = () => {
    // If docs selected, analyze selected; otherwise analyze all completed
    const docsToAnalyze = selectedDocs.length > 0 ? selectedDocs : completedDocs.map(d => d.id);
    onRunAnalysis(docsToAnalyze);
  };

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setViewMode('standard')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'standard'
                    ? 'bg-white text-[#1A1A1A] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#1A1A1A]'
                }`}
              >
                By Standard
              </button>
              <button
                onClick={() => setViewMode('matrix')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'matrix'
                    ? 'bg-white text-[#1A1A1A] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#1A1A1A]'
                }`}
              >
                Matrix View
              </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-[#6B7280]">
                {totalQuotes} quote{totalQuotes !== 1 ? 's' : ''} found
              </span>
              {selectedDocs.length > 0 && (
                <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                  {selectedDocs.length} doc{selectedDocs.length !== 1 ? 's' : ''} selected
                </span>
              )}
            </div>
          </div>

          {/* Run Analysis Button */}
          <button
            onClick={handleRunAnalysis}
            disabled={!canAnalyze || isAnalyzing}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Analyzing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {selectedDocs.length > 0 ? `Analyze ${selectedDocs.length} Selected` : 'Analyze All'}
              </>
            )}
          </button>
        </div>

        {/* Help text */}
        {completedDocs.length === 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Upload and OCR documents first to run analysis.
          </div>
        )}
      </div>

      {/* Results View */}
      {viewMode === 'standard' ? (
        <StandardView
          quotesByStandard={quotesByStandard}
          onViewQuote={onViewQuote}
        />
      ) : (
        <MatrixView
          quotesByStandard={quotesByStandard}
          documents={documents}
          onViewQuote={onViewQuote}
        />
      )}

      {/* Empty State */}
      {totalQuotes === 0 && documents.length > 0 && completedDocs.length > 0 && !isAnalyzing && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#6B7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[#1A1A1A] mb-2">No Analysis Yet</h3>
          <p className="text-[#6B7280] mb-4">
            Click "Analyze All" to extract L-1 evidence from your documents.
          </p>
        </div>
      )}
    </div>
  );
}
