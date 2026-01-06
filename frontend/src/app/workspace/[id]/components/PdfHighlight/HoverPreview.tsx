'use client';

import { useState, useRef, useEffect } from 'react';
import type { Quote } from '@/types';

interface HoverPreviewProps {
  quote: Quote;
  children: React.ReactNode;
  onClickView?: () => void;
}

export default function HoverPreview({ quote, children, onClickView }: HoverPreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHovered && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const previewWidth = 320;
      const previewHeight = 200;

      // Calculate position, prefer above and to the right
      let x = rect.left;
      let y = rect.top - previewHeight - 10;

      // If too close to top, show below
      if (y < 10) {
        y = rect.bottom + 10;
      }

      // If too close to right edge, align to right
      if (x + previewWidth > window.innerWidth - 10) {
        x = window.innerWidth - previewWidth - 10;
      }

      setPosition({ x, y });
    }
  }, [isHovered]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClickView}
        className="cursor-pointer"
      >
        {children}
      </span>

      {/* Floating Preview */}
      {isHovered && (
        <div
          ref={previewRef}
          className="fixed z-[100] w-80 bg-white rounded-xl shadow-2xl border border-[#E5E7EB] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          style={{
            left: position.x,
            top: position.y,
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-[#E5E7EB] flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm text-[#1A1A1A]">
                Exhibit {quote.source.exhibit_id}
              </div>
              <div className="text-xs text-[#6B7280] truncate max-w-48">
                {quote.source.file_name}
              </div>
            </div>
          </div>

          {/* Quote Preview */}
          <div className="p-4">
            <div className="text-sm text-[#1A1A1A] italic line-clamp-4 mb-3">
              "{quote.quote}"
            </div>

            {/* Meta Info */}
            <div className="flex items-center justify-between text-xs text-[#6B7280]">
              <div className="flex items-center gap-2">
                {quote.page && (
                  <span className="px-2 py-1 bg-gray-100 rounded">Page {quote.page}</span>
                )}
                <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded">
                  {quote.standard_en || quote.standard}
                </span>
              </div>
            </div>

            {/* Relevance */}
            <div className="mt-3 text-xs text-[#6B7280]">
              {quote.relevance}
            </div>
          </div>

          {/* Click hint */}
          <div className="px-4 py-2 bg-gray-50 border-t border-[#E5E7EB] text-center">
            <span className="text-xs text-blue-600">Click to view PDF with highlight</span>
          </div>
        </div>
      )}
    </>
  );
}
