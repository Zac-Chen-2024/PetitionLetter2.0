'use client';

import { useState, useEffect } from 'react';
import type { Document } from '@/types';

interface TextBlock {
  block_type: string;
  text_content: string;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  page_number?: number;
}

interface PreviewPanelProps {
  document: Document | null;
  projectId: string;
  onCopyText: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function PreviewPanel({ document, projectId, onCopyText }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<'highlight' | 'ocr'>('ocr');
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [hoveredBlock, setHoveredBlock] = useState<number | null>(null);

  // Fetch text blocks when document changes and tab is highlight
  useEffect(() => {
    if (document && activeTab === 'highlight') {
      fetchTextBlocks();
      fetchDocumentImage();
    }
  }, [document?.id, activeTab]);

  const fetchTextBlocks = async () => {
    if (!document) return;
    setLoadingBlocks(true);
    try {
      const response = await fetch(`${API_BASE}/api/text-blocks/${document.id}`);
      if (response.ok) {
        const data = await response.json();
        setTextBlocks(data.text_blocks || []);
      }
    } catch (error) {
      console.error('Failed to fetch text blocks:', error);
    } finally {
      setLoadingBlocks(false);
    }
  };

  const fetchDocumentImage = async () => {
    if (!document) return;
    setLoadingImage(true);
    try {
      // Try to get the document file for preview
      const response = await fetch(`${API_BASE}/api/document/${document.id}/file`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setImageUrl(url);

        // Get image dimensions
        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.src = url;
      }
    } catch (error) {
      console.error('Failed to fetch document image:', error);
    } finally {
      setLoadingImage(false);
    }
  };

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    onCopyText();
  };

  if (!document) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-[#6B7280]">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">Select a document to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header with Tabs */}
      <div className="flex-shrink-0 border-b border-[#E5E7EB]">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-mono text-blue-600 flex-shrink-0">
              {document.exhibit_number || '-'}
            </span>
            <span className="text-sm text-[#1A1A1A] truncate" title={document.file_name}>
              {document.file_name}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setActiveTab('highlight')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'highlight'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-[#6B7280] hover:bg-gray-100'
              }`}
            >
              Highlight
            </button>
            <button
              onClick={() => setActiveTab('ocr')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'ocr'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-[#6B7280] hover:bg-gray-100'
              }`}
            >
              OCR Text
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'ocr' ? (
          // OCR Text View
          <div className="h-full flex flex-col">
            {/* OCR Status Bar */}
            <div className="flex-shrink-0 px-4 py-2 bg-gray-50 border-b border-[#E5E7EB] flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-[#6B7280]">
                <span>Pages: {document.page_count || 1}</span>
                <span>~{Math.round((document.ocr_text?.length || 0) / 4)} tokens</span>
              </div>
              <button
                onClick={() => copyToClipboard(document.ocr_text || '')}
                disabled={!document.ocr_text}
                className="px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                Copy All
              </button>
            </div>

            {/* OCR Text Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {document.ocr_status === 'completed' && document.ocr_text ? (
                <pre className="text-sm text-[#1A1A1A] whitespace-pre-wrap font-mono leading-relaxed">
                  {document.ocr_text}
                </pre>
              ) : document.ocr_status === 'processing' ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-3"></div>
                    <p className="text-sm text-[#6B7280]">OCR in progress...</p>
                  </div>
                </div>
              ) : document.ocr_status === 'failed' ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-red-500">
                    <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm">OCR failed</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-[#6B7280]">
                    <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">OCR not started</p>
                    <p className="text-xs mt-1">Click "Start OCR" to process</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Highlight View
          <div className="h-full flex flex-col">
            {loadingImage || loadingBlocks ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
              </div>
            ) : imageUrl && imageSize ? (
              <div className="flex-1 overflow-auto p-4">
                <div className="relative inline-block" style={{ maxWidth: '100%' }}>
                  <img
                    src={imageUrl}
                    alt={document.file_name}
                    className="max-w-full h-auto"
                  />
                  {/* BBox Overlays */}
                  <svg
                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                    viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {textBlocks.map((block, index) => {
                      const { x1, y1, x2, y2 } = block.bbox;
                      const isHovered = hoveredBlock === index;
                      return (
                        <g key={index}>
                          <rect
                            x={x1}
                            y={y1}
                            width={x2 - x1}
                            height={y2 - y1}
                            fill={isHovered ? 'rgba(37, 99, 235, 0.3)' : 'rgba(37, 99, 235, 0.1)'}
                            stroke={isHovered ? '#2563EB' : '#93C5FD'}
                            strokeWidth={isHovered ? 2 : 1}
                            className="cursor-pointer pointer-events-auto transition-all"
                            onMouseEnter={() => setHoveredBlock(index)}
                            onMouseLeave={() => setHoveredBlock(null)}
                            onClick={() => copyToClipboard(block.text_content)}
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Tooltip for hovered block */}
                  {hoveredBlock !== null && textBlocks[hoveredBlock] && (
                    <div
                      className="absolute z-10 bg-white border border-[#E5E7EB] rounded-lg shadow-lg p-3 max-w-xs pointer-events-none"
                      style={{
                        left: textBlocks[hoveredBlock].bbox.x1,
                        top: textBlocks[hoveredBlock].bbox.y2 + 5,
                      }}
                    >
                      <p className="text-xs text-[#6B7280] mb-1">
                        {textBlocks[hoveredBlock].block_type}
                      </p>
                      <p className="text-sm text-[#1A1A1A] line-clamp-3">
                        {textBlocks[hoveredBlock].text_content}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">Click to copy</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-[#6B7280]">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">Preview not available</p>
                  <p className="text-xs mt-1">Run OCR to see text blocks</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
