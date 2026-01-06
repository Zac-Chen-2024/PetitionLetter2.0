'use client';

import { useMemo, useState } from 'react';
import type { Quote, Document, L1StandardKey } from '@/types';
import { STANDARD_DISPLAY_NAMES } from '@/utils/prompts';

interface MatrixViewProps {
  quotesByStandard: Record<string, Quote[]>;
  documents: Document[];
  onViewQuote?: (quote: Quote) => void;
}

// Standard order
const STANDARD_ORDER: L1StandardKey[] = [
  'qualifying_relationship',
  'qualifying_employment',
  'qualifying_capacity',
  'doing_business',
];

// Short labels for matrix header
const SHORT_LABELS: Record<L1StandardKey, string> = {
  qualifying_relationship: 'Relationship',
  qualifying_employment: 'Employment',
  qualifying_capacity: 'Capacity',
  doing_business: 'Operations',
};

export default function MatrixView({ quotesByStandard, documents, onViewQuote }: MatrixViewProps) {
  const [selectedCell, setSelectedCell] = useState<{ docId: string; standard: string } | null>(null);

  // Get unique exhibits from quotes
  const exhibitsWithQuotes = useMemo(() => {
    const exhibits = new Set<string>();
    Object.values(quotesByStandard).flat().forEach(q => {
      exhibits.add(q.source.exhibit_id);
    });
    return exhibits;
  }, [quotesByStandard]);

  // Create matrix data: exhibit -> standard -> quotes
  const matrixData = useMemo(() => {
    const matrix: Record<string, Record<string, Quote[]>> = {};

    // Initialize matrix
    documents.forEach(doc => {
      if (doc.exhibit_number) {
        matrix[doc.exhibit_number] = {};
        STANDARD_ORDER.forEach(std => {
          matrix[doc.exhibit_number!][std] = [];
        });
      }
    });

    // Fill with quotes
    Object.entries(quotesByStandard).forEach(([standard, quotes]) => {
      quotes.forEach(quote => {
        const exhibitId = quote.source.exhibit_id;
        if (matrix[exhibitId]) {
          matrix[exhibitId][standard] = matrix[exhibitId][standard] || [];
          matrix[exhibitId][standard].push(quote);
        }
      });
    });

    return matrix;
  }, [quotesByStandard, documents]);

  // Filter documents that have any quotes
  const relevantDocs = documents.filter(d =>
    d.exhibit_number && exhibitsWithQuotes.has(d.exhibit_number)
  );

  // Get quotes for selected cell
  const selectedQuotes = useMemo(() => {
    if (!selectedCell) return [];
    return matrixData[selectedCell.docId]?.[selectedCell.standard] || [];
  }, [selectedCell, matrixData]);

  const getCellColor = (count: number) => {
    if (count >= 3) return 'bg-[#10B981] text-white';
    if (count === 2) return 'bg-emerald-300 text-emerald-900';
    if (count === 1) return 'bg-emerald-100 text-emerald-700';
    return 'bg-gray-50 text-gray-400';
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-[#6B7280]">
        No documents uploaded yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Matrix Table */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-[#E5E7EB]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-32">
                  Document
                </th>
                {STANDARD_ORDER.map(std => (
                  <th key={std} className="px-4 py-3 text-center text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                    <div>{SHORT_LABELS[std]}</div>
                    <div className="text-[10px] font-normal normal-case text-gray-400">
                      {STANDARD_DISPLAY_NAMES[std]?.chinese}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-20">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {relevantDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#6B7280] text-sm">
                    No analysis results yet. Run analysis to see the matrix.
                  </td>
                </tr>
              ) : (
                relevantDocs.map(doc => {
                  const exhibitId = doc.exhibit_number!;
                  const rowData = matrixData[exhibitId] || {};
                  const rowTotal = STANDARD_ORDER.reduce((sum, std) => sum + (rowData[std]?.length || 0), 0);

                  return (
                    <tr key={doc.id} className="border-b border-[#E5E7EB] hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm text-blue-600">{exhibitId}</div>
                        <div className="text-xs text-[#6B7280] truncate max-w-32" title={doc.file_name}>
                          {doc.file_name}
                        </div>
                      </td>
                      {STANDARD_ORDER.map(std => {
                        const count = rowData[std]?.length || 0;
                        const isSelected = selectedCell?.docId === exhibitId && selectedCell?.standard === std;

                        return (
                          <td key={std} className="px-4 py-3">
                            <button
                              onClick={() => count > 0 && setSelectedCell({ docId: exhibitId, standard: std })}
                              disabled={count === 0}
                              className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition-all ${getCellColor(count)} ${
                                count > 0 ? 'cursor-pointer hover:ring-2 hover:ring-blue-400' : 'cursor-default'
                              } ${isSelected ? 'ring-2 ring-blue-600' : ''}`}
                            >
                              {count}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-[#1A1A1A]">{rowTotal}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Column totals */}
            {relevantDocs.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-[#E5E7EB]">
                  <td className="px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">
                    Total
                  </td>
                  {STANDARD_ORDER.map(std => {
                    const total = quotesByStandard[std]?.length || 0;
                    return (
                      <td key={std} className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-[#1A1A1A]">{total}</span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold text-blue-600">
                      {Object.values(quotesByStandard).flat().length}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Selected Cell Detail */}
      {selectedCell && selectedQuotes.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-blue-50 text-blue-600 text-sm font-medium rounded">
                {selectedCell.docId}
              </span>
              <span className="text-[#6B7280]">/</span>
              <span className="text-sm font-medium text-[#1A1A1A]">
                {STANDARD_DISPLAY_NAMES[selectedCell.standard as L1StandardKey]?.english || selectedCell.standard}
              </span>
            </div>
            <button
              onClick={() => setSelectedCell(null)}
              className="text-[#6B7280] hover:text-[#1A1A1A] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-3">
            {selectedQuotes.map((quote, idx) => (
              <div
                key={idx}
                className="bg-gray-50 rounded-lg p-4 border border-[#E5E7EB] cursor-pointer hover:border-blue-300 transition-colors"
                onClick={() => onViewQuote?.(quote)}
              >
                <div className="text-sm text-[#1A1A1A] mb-2">"{quote.quote}"</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#6B7280]">{quote.relevance}</span>
                  {quote.page && (
                    <span className="text-xs text-blue-600">Page {quote.page}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[#6B7280]">
        <span>Legend:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-[#10B981]"></div>
          <span>3+ quotes</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-emerald-300"></div>
          <span>2 quotes</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-emerald-100"></div>
          <span>1 quote</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-50 border border-gray-200"></div>
          <span>No quotes</span>
        </div>
      </div>
    </div>
  );
}
