'use client';

import { useState } from 'react';
import type { Quote, L1StandardKey } from '@/types';
import { STANDARD_DISPLAY_NAMES } from '@/utils/prompts';

interface AnalysisResultsProps {
  quotesByStandard: Record<string, Quote[]>;
  documents: { id: string; exhibit_number?: string; file_name: string }[];
  onViewDocument?: (exhibitId: string) => void;
}

// Exhibit hover tooltip component
function ExhibitTooltip({ quote, onViewDocument }: { quote: Quote; onViewDocument?: (exhibitId: string) => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded cursor-pointer hover:bg-blue-200 transition-colors">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {quote.source.exhibit_id}
        {quote.page && <span className="text-blue-500">p.{quote.page}</span>}
      </span>

      {/* Hover tooltip */}
      {isHovered && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Arrow */}
          <div className="absolute -bottom-2 left-4 w-4 h-4 bg-white border-r border-b border-gray-200 transform rotate-45"></div>

          {/* Content */}
          <div className="relative">
            {/* Header */}
            <div className="flex items-start gap-2 mb-2">
              <div className="p-1.5 bg-blue-100 rounded">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900">
                  Exhibit {quote.source.exhibit_id}
                </div>
                <div className="text-xs text-gray-700 truncate">
                  {quote.source.file_name}
                </div>
              </div>
            </div>

            {/* Page info */}
            {quote.page && (
              <div className="text-xs text-gray-700 mb-2">
                Page {quote.page}
              </div>
            )}

            {/* Relevance */}
            <div className="text-xs text-gray-700 mb-3 line-clamp-2">
              {quote.relevance}
            </div>

            {/* View button */}
            {onViewDocument && (
              <button
                onClick={() => onViewDocument(quote.source.exhibit_id)}
                className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                View Document
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Single quote card
function QuoteCard({ quote, onViewDocument }: { quote: Quote; onViewDocument?: (exhibitId: string) => void }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
      {/* Quote text */}
      <div className="text-sm text-gray-800 mb-2 italic">
        &ldquo;{quote.quote}&rdquo;
      </div>

      {/* Relevance */}
      <div className="text-xs text-gray-700 mb-2">
        {quote.relevance}
      </div>

      {/* Source with hover tooltip */}
      <div className="flex items-center justify-between">
        <ExhibitTooltip quote={quote} onViewDocument={onViewDocument} />
      </div>
    </div>
  );
}

// Standard section (collapsible)
function StandardSection({
  standardKey,
  quotes,
  onViewDocument,
}: {
  standardKey: string;
  quotes: Quote[];
  onViewDocument?: (exhibitId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayName = STANDARD_DISPLAY_NAMES[standardKey as L1StandardKey] || {
    chinese: standardKey,
    english: standardKey,
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-gray-900">{displayName.english}</span>
          <span className="text-sm text-gray-700">({displayName.chinese})</span>
        </div>
        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
          {quotes.length} quotes
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {quotes.map((quote, index) => (
            <QuoteCard key={index} quote={quote} onViewDocument={onViewDocument} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalysisResults({
  quotesByStandard,
  documents,
  onViewDocument,
}: AnalysisResultsProps) {
  const [filterDoc, setFilterDoc] = useState<string>('');

  // Get unique exhibits from quotes
  const exhibitsInResults = new Set<string>();
  Object.values(quotesByStandard).flat().forEach(q => {
    exhibitsInResults.add(q.source.exhibit_id);
  });

  // Filter quotes by document if selected
  const filteredQuotes = Object.entries(quotesByStandard).reduce((acc, [key, quotes]) => {
    const filtered = filterDoc
      ? quotes.filter(q => q.source.exhibit_id === filterDoc)
      : quotes;
    if (filtered.length > 0) {
      acc[key] = filtered;
    }
    return acc;
  }, {} as Record<string, Quote[]>);

  const totalQuotes = Object.values(quotesByStandard).flat().length;
  const filteredTotal = Object.values(filteredQuotes).flat().length;

  // Standard order for display
  const standardOrder: L1StandardKey[] = [
    'qualifying_relationship',
    'qualifying_employment',
    'qualifying_capacity',
    'doing_business',
  ];

  const orderedEntries: [string, Quote[]][] = standardOrder
    .filter(key => filteredQuotes[key])
    .map(key => [key, filteredQuotes[key]]);

  // Add any other standards not in the order
  Object.entries(filteredQuotes)
    .filter(([key]) => !standardOrder.includes(key as L1StandardKey))
    .forEach(entry => orderedEntries.push(entry));

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Analysis Results</h3>
            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
              {filteredTotal} / {totalQuotes} quotes
            </span>
          </div>

          {/* Document filter */}
          <select
            value={filterDoc}
            onChange={(e) => setFilterDoc(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-900 bg-white"
          >
            <option value="">All Documents</option>
            {Array.from(exhibitsInResults).sort().map(exhibitId => (
              <option key={exhibitId} value={exhibitId}>
                {exhibitId}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {orderedEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-700">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">No analysis results yet.</p>
            <p className="text-xs text-gray-600 mt-1">Run analysis on documents to see results here.</p>
          </div>
        ) : (
          orderedEntries.map(([key, quotes]) => (
            <StandardSection
              key={key}
              standardKey={key}
              quotes={quotes}
              onViewDocument={onViewDocument}
            />
          ))
        )}
      </div>
    </div>
  );
}
