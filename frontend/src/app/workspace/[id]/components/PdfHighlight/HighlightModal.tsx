'use client';

import { useEffect, useState } from 'react';
import type { Quote } from '@/types';

interface HighlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote | null;
  documentOcrText?: string;
}

export default function HighlightModal({ isOpen, onClose, quote, documentOcrText }: HighlightModalProps) {
  const [highlightedText, setHighlightedText] = useState<string>('');

  useEffect(() => {
    if (quote && documentOcrText) {
      // Find and highlight the quote in the OCR text
      const quoteText = quote.quote;
      const lowerOcr = documentOcrText.toLowerCase();
      const lowerQuote = quoteText.toLowerCase();

      const index = lowerOcr.indexOf(lowerQuote);

      if (index !== -1) {
        // Get context around the quote (500 chars before and after)
        const contextStart = Math.max(0, index - 500);
        const contextEnd = Math.min(documentOcrText.length, index + quoteText.length + 500);

        const before = documentOcrText.slice(contextStart, index);
        const match = documentOcrText.slice(index, index + quoteText.length);
        const after = documentOcrText.slice(index + quoteText.length, contextEnd);

        setHighlightedText(`...${before}<mark class="bg-yellow-300 px-1 rounded">${match}</mark>${after}...`);
      } else {
        // If exact match not found, just show the quote
        setHighlightedText(`<mark class="bg-yellow-300 px-1 rounded">${quoteText}</mark>`);
      }
    }
  }, [quote, documentOcrText]);

  if (!isOpen || !quote) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">
                Exhibit {quote.source.exhibit_id}
              </h2>
              <p className="text-sm text-[#6B7280]">{quote.source.file_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#6B7280] hover:text-[#1A1A1A] hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Meta Info */}
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-4 flex-shrink-0">
          {quote.page && (
            <span className="px-3 py-1 bg-white text-blue-600 text-sm font-medium rounded-lg">
              Page {quote.page}
            </span>
          )}
          <span className="px-3 py-1 bg-white text-[#6B7280] text-sm rounded-lg">
            {quote.standard_en || quote.standard}
          </span>
          <span className="text-sm text-blue-700">{quote.relevance}</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Quote Box */}
          <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
            <div className="text-xs text-[#6B7280] uppercase tracking-wider mb-2">Matched Quote</div>
            <div className="text-sm text-[#1A1A1A] italic">
              "{quote.quote}"
            </div>
          </div>

          {/* OCR Context */}
          {documentOcrText ? (
            <div>
              <div className="text-xs text-[#6B7280] uppercase tracking-wider mb-3">Document Context</div>
              <div
                className="text-sm text-[#1A1A1A] leading-relaxed font-mono whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-[#E5E7EB]"
                dangerouslySetInnerHTML={{ __html: highlightedText }}
              />
            </div>
          ) : (
            <div className="text-center py-8 text-[#6B7280]">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">PDF preview with BBox highlighting coming soon.</p>
              <p className="text-xs mt-1">BBox matching is being implemented in the backend.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-[#6B7280]">
            Note: Full PDF page rendering with BBox highlight overlay is planned for future updates.
          </div>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(quote.quote);
            }}
            className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            Copy Quote
          </button>
        </div>
      </div>
    </div>
  );
}
