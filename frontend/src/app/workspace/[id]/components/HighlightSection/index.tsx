'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { highlightApi, HighlightItem, DocumentHighlightInfo } from '@/utils/api';
import type { Document } from '@/types';

// Category colors for visual distinction
const CATEGORY_COLORS: Record<string, string> = {
  company_name: 'bg-blue-100 border-blue-300 text-blue-800',
  person_name: 'bg-green-100 border-green-300 text-green-800',
  date: 'bg-purple-100 border-purple-300 text-purple-800',
  amount: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  address: 'bg-orange-100 border-orange-300 text-orange-800',
  position: 'bg-pink-100 border-pink-300 text-pink-800',
  key_fact: 'bg-red-100 border-red-300 text-red-800',
  legal_term: 'bg-indigo-100 border-indigo-300 text-indigo-800',
  signature: 'bg-gray-100 border-gray-300 text-gray-800',
  other: 'bg-gray-100 border-gray-300 text-gray-600',
};

// Importance badge colors
const IMPORTANCE_COLORS: Record<string, string> = {
  high: 'bg-red-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-gray-400 text-white',
};

interface HighlightSectionProps {
  projectId: string;
  documents: Document[];
  onError?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
}

export default function HighlightSection({
  projectId,
  documents,
  onError,
  onSuccess,
}: HighlightSectionProps) {
  // State
  const [docInfoList, setDocInfoList] = useState<DocumentHighlightInfo[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [highlightsByPage, setHighlightsByPage] = useState<Record<number, HighlightItem[]>>({});
  const [highlightStatus, setHighlightStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedHighlight, setSelectedHighlight] = useState<HighlightItem | null>(null);

  // Canvas ref for highlight overlay
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Load documents with highlight status
  const loadDocuments = useCallback(async () => {
    if (!projectId) return;
    try {
      const result = await highlightApi.getProgress(projectId);
      // Filter to only show OCR completed documents
      const ocrCompletedDocs = result.documents.filter(d => d.ocr_status === 'completed');
      setDocInfoList(ocrCompletedDocs);

      // Auto-select first document if none selected
      if (!selectedDocId && ocrCompletedDocs.length > 0) {
        setSelectedDocId(ocrCompletedDocs[0].id);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, [projectId, selectedDocId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Load highlights for selected document
  const loadHighlights = useCallback(async () => {
    if (!selectedDocId) return;

    setIsLoading(true);
    try {
      const result = await highlightApi.getHighlightsByPage(selectedDocId);
      setHighlightsByPage(result.highlights_by_page);
      setPageCount(result.page_count || 1);
      setHighlightStatus(result.highlight_status);

      // Flatten highlights for the list
      const allHighlights: HighlightItem[] = [];
      Object.values(result.highlights_by_page).forEach(pageHighlights => {
        allHighlights.push(...pageHighlights);
      });
      setHighlights(allHighlights);

      // Reset to page 1 when switching documents
      setCurrentPage(1);
    } catch (err) {
      console.error('Failed to load highlights:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDocId]);

  useEffect(() => {
    loadHighlights();
  }, [loadHighlights]);

  // Trigger highlight analysis
  const triggerAnalysis = async () => {
    if (!selectedDocId) return;

    setIsAnalyzing(true);
    try {
      await highlightApi.trigger(selectedDocId);
      // Poll for completion
      const pollInterval = setInterval(async () => {
        const status = await highlightApi.getStatus(selectedDocId);
        if (status.highlight_status === 'completed' || status.highlight_status === 'failed') {
          clearInterval(pollInterval);
          setIsAnalyzing(false);
          loadHighlights();
          loadDocuments();
          if (status.highlight_status === 'completed') {
            onSuccess?.('Highlight analysis completed');
          } else {
            onError?.('Highlight analysis failed');
          }
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to trigger analysis:', err);
      onError?.('Failed to start highlight analysis');
      setIsAnalyzing(false);
    }
  };

  // Draw highlights on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Wait for image to load
    const drawHighlights = () => {
      // Set canvas size to match image
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get highlights for current page
      const pageHighlights = highlightsByPage[currentPage] || [];

      // Draw each highlight
      pageHighlights.forEach(h => {
        if (!h.bbox || h.bbox.x1 === null) return;

        // DeepSeek-OCR outputs coordinates in 0-1000 range
        // Scale to image dimensions
        const scaleX = canvas.width / 1000;
        const scaleY = canvas.height / 1000;

        const x = h.bbox.x1! * scaleX;
        const y = h.bbox.y1! * scaleY;
        const width = (h.bbox.x2! - h.bbox.x1!) * scaleX;
        const height = (h.bbox.y2! - h.bbox.y1!) * scaleY;

        // Highlight fill (light yellow, semi-transparent)
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.fillRect(x, y, width, height);

        // Highlight border (darker for selected)
        if (selectedHighlight?.id === h.id) {
          ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)';
          ctx.lineWidth = 3;
        } else {
          ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
          ctx.lineWidth = 1;
        }
        ctx.strokeRect(x, y, width, height);
      });
    };

    if (image.complete) {
      drawHighlights();
    } else {
      image.onload = drawHighlights;
    }
  }, [currentPage, highlightsByPage, selectedHighlight]);

  // Handle highlight click - scroll to page and highlight
  const handleHighlightClick = (h: HighlightItem) => {
    setSelectedHighlight(h);
    if (h.page_number !== currentPage) {
      setCurrentPage(h.page_number);
    }
  };

  // Get image URL for current page
  const getImageUrl = () => {
    if (!selectedDocId) return '';
    return highlightApi.getPageImage(selectedDocId, currentPage, 150);
  };

  // Get selected document info
  const selectedDoc = docInfoList.find(d => d.id === selectedDocId);
  const completedCount = docInfoList.filter(d => d.highlight_status === 'completed').length;

  // No OCR-completed documents
  if (docInfoList.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#6B7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[#1A1A1A] mb-2">No Documents Ready</h3>
        <p className="text-[#6B7280]">
          Complete OCR on documents first to analyze highlights.
        </p>
      </div>
    );
  }

  // Main view - three-column layout
  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#6B7280]">
              {docInfoList.length} document{docInfoList.length !== 1 ? 's' : ''} ready
            </span>
            <span className="text-[#E5E7EB]">|</span>
            <span className="text-sm text-[#6B7280]">
              {completedCount} analyzed
            </span>
            {highlights.length > 0 && (
              <>
                <span className="text-[#E5E7EB]">|</span>
                <span className="px-2 py-1 bg-yellow-50 text-yellow-600 rounded text-xs font-medium">
                  {highlights.length} highlight{highlights.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
          <button
            onClick={triggerAnalysis}
            disabled={isAnalyzing || !selectedDocId || highlightStatus === 'processing'}
            className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
                Analyze Highlights
              </>
            )}
          </button>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden" style={{ height: '600px' }}>
        <div className="flex h-full">
          {/* Left panel - Document list */}
          <div className="w-56 border-r overflow-y-auto bg-gray-50">
            <div className="p-3 border-b bg-gray-100">
              <h3 className="font-medium text-gray-700 text-sm">Documents</h3>
            </div>
            <div className="divide-y">
              {docInfoList.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`w-full text-left p-3 hover:bg-gray-100 transition ${
                    selectedDocId === doc.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      doc.highlight_status === 'completed' ? 'bg-green-500' :
                      doc.highlight_status === 'processing' ? 'bg-yellow-500' :
                      doc.highlight_status === 'failed' ? 'bg-red-500' : 'bg-gray-300'
                    }`} />
                    <span className="text-sm font-medium text-gray-700 truncate">
                      {doc.exhibit_number || 'N/A'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-1">{doc.file_name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Middle panel - Document image with highlights */}
          <div className="flex-1 bg-gray-100 overflow-hidden flex flex-col">
            {selectedDocId ? (
              <>
                {/* Toolbar */}
                <div className="bg-white border-b p-2 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                      >
                        &larr;
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {currentPage} / {pageCount}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
                        disabled={currentPage >= pageCount}
                        className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                      >
                        &rarr;
                      </button>
                    </div>
                    <span className="text-xs text-gray-500">
                      {highlightStatus || 'Not analyzed'}
                    </span>
                  </div>
                </div>

                {/* Image container */}
                <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-gray-500">Loading...</div>
                    </div>
                  ) : (
                    <div className="relative inline-block shadow-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        ref={imageRef}
                        src={getImageUrl()}
                        alt={`Page ${currentPage}`}
                        className="max-w-full max-h-[500px] object-contain"
                      />
                      <canvas
                        ref={canvasRef}
                        className="absolute top-0 left-0 pointer-events-none"
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                Select a document to view highlights
              </div>
            )}
          </div>

          {/* Right panel - Highlight list */}
          <div className="w-72 border-l overflow-y-auto">
            <div className="p-3 border-b bg-gray-50">
              <h3 className="font-medium text-gray-700 text-sm">Highlights</h3>
              <p className="text-xs text-gray-500 mt-1">
                {highlights.length} item{highlights.length !== 1 ? 's' : ''} found
              </p>
            </div>

            {highlights.length === 0 && !isLoading && highlightStatus !== 'completed' && (
              <div className="p-4 text-center text-gray-500 text-sm">
                No highlights yet. Click &quot;Analyze Selected Doc&quot; to start.
              </div>
            )}

            <div className="divide-y">
              {highlights.map((h, index) => (
                <button
                  key={h.id}
                  onClick={() => handleHighlightClick(h)}
                  className={`w-full text-left p-3 hover:bg-gray-50 transition ${
                    selectedHighlight?.id === h.id ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-medium text-gray-400">#{index + 1}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${
                          CATEGORY_COLORS[h.category || 'other']
                        }`}>
                          {h.category_cn || h.category || 'Other'}
                        </span>
                        {h.importance && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            IMPORTANCE_COLORS[h.importance]
                          }`}>
                            {h.importance}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 line-clamp-2">
                        {h.text_content || '(No text)'}
                      </p>
                      {h.reason && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                          {h.reason}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Page {h.page_number}
                        {h.bbox ? ' - Has BBox' : ' - No BBox'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
