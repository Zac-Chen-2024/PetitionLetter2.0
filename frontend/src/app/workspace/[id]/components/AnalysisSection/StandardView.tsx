'use client';

import { useState } from 'react';
import type { Quote, L1StandardKey } from '@/types';
import { STANDARD_DISPLAY_NAMES } from '@/utils/prompts';

interface StandardViewProps {
  quotesByStandard: Record<string, Quote[]>;
  onViewQuote?: (quote: Quote) => void;
}

// Quote card component
function QuoteCard({ quote, onView }: { quote: Quote; onView?: () => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="bg-gray-50 rounded-lg p-4 border border-[#E5E7EB] hover:border-blue-300 transition-colors cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onView}
    >
      {/* Quote text */}
      <div className="text-sm text-[#1A1A1A] mb-3 line-clamp-3">
        "{quote.quote}"
      </div>

      {/* Relevance */}
      <div className="text-xs text-[#6B7280] mb-3">
        {quote.relevance}
      </div>

      {/* Source */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded">
            {quote.source.exhibit_id}
          </span>
          {quote.page && (
            <span className="text-xs text-[#6B7280]">p.{quote.page}</span>
          )}
        </div>
        {isHovered && (
          <span className="text-xs text-blue-600">View in PDF</span>
        )}
      </div>
    </div>
  );
}

// Standard section (collapsible)
function StandardSection({
  standardKey,
  quotes,
  onViewQuote,
}: {
  standardKey: string;
  quotes: Quote[];
  onViewQuote?: (quote: Quote) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const displayName = STANDARD_DISPLAY_NAMES[standardKey as L1StandardKey] || {
    chinese: standardKey,
    english: standardKey,
  };

  const getStatusColor = () => {
    if (quotes.length >= 5) return 'bg-[#10B981]';
    if (quotes.length >= 2) return 'bg-[#F59E0B]';
    if (quotes.length >= 1) return 'bg-blue-500';
    return 'bg-gray-300';
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-4 h-4 text-[#6B7280] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
          <div className="text-left">
            <div className="font-semibold text-[#1A1A1A]">{displayName.english}</div>
            <div className="text-xs text-[#6B7280]">{displayName.chinese}</div>
          </div>
        </div>
        <span className="px-3 py-1 text-sm font-medium bg-gray-100 text-[#6B7280] rounded-full">
          {quotes.length} quote{quotes.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-5 border-t border-[#E5E7EB] space-y-3">
          {quotes.length > 0 ? (
            quotes.map((quote, index) => (
              <QuoteCard
                key={index}
                quote={quote}
                onView={() => onViewQuote?.(quote)}
              />
            ))
          ) : (
            <div className="text-center py-8 text-[#6B7280] text-sm">
              No evidence found for this standard yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StandardView({ quotesByStandard, onViewQuote }: StandardViewProps) {
  // Standard order for display
  const standardOrder: L1StandardKey[] = [
    'qualifying_relationship',
    'qualifying_employment',
    'qualifying_capacity',
    'doing_business',
  ];

  const totalQuotes = Object.values(quotesByStandard).flat().length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#1A1A1A] font-medium">
          {totalQuotes} Total Quotes
        </span>
        <div className="flex items-center gap-2">
          {standardOrder.map(key => {
            const count = quotesByStandard[key]?.length || 0;
            return (
              <div key={key} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${
                  count >= 5 ? 'bg-[#10B981]' : count >= 2 ? 'bg-[#F59E0B]' : count >= 1 ? 'bg-blue-500' : 'bg-gray-300'
                }`}></div>
                <span className="text-xs text-[#6B7280]">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Standards */}
      {standardOrder.map(key => (
        <StandardSection
          key={key}
          standardKey={key}
          quotes={quotesByStandard[key] || []}
          onViewQuote={onViewQuote}
        />
      ))}
    </div>
  );
}
