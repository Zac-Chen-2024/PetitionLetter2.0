'use client';

import { useState } from 'react';
import type { Document } from '@/types';

interface FolderGroupProps {
  folderName: string;
  documents: Document[];
  selectedDocs: string[];
  onSelectDoc: (docId: string) => void;
  onViewOCR: (doc: Document) => void;
  onDeleteDoc: (docId: string) => void;
  onRemoveFolder?: (folderName: string) => void;
  canRemove?: boolean;
  defaultExpanded?: boolean;
}

export default function FolderGroup({
  folderName,
  documents,
  selectedDocs,
  onSelectDoc,
  onViewOCR,
  onDeleteDoc,
  onRemoveFolder,
  canRemove = false,
  defaultExpanded = false,
}: FolderGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const folderSelectedCount = documents.filter(d => selectedDocs.includes(d.id)).length;
  const completedCount = documents.filter(d => d.ocr_status === 'completed').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-[#10B981] text-white';
      case 'processing':
        return 'bg-[#F59E0B] text-white';
      case 'failed':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-200 text-[#6B7280]';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Done';
      case 'processing':
        return 'OCR...';
      case 'failed':
        return 'Failed';
      default:
        return 'Pending';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      {/* Folder Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          {/* Expand Icon */}
          <svg
            className={`w-4 h-4 text-[#6B7280] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {/* Folder Icon */}
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
          </div>

          {/* Folder Info */}
          <div className="text-left">
            <div className="font-semibold text-[#1A1A1A]">Folder {folderName}</div>
            <div className="text-xs text-[#6B7280]">
              {documents.length} file{documents.length !== 1 ? 's' : ''}
              {completedCount > 0 && ` • ${completedCount} OCR done`}
            </div>
          </div>
        </div>

        {/* Right Side Stats */}
        <div className="flex items-center gap-3">
          {folderSelectedCount > 0 && (
            <span className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md">
              {folderSelectedCount} selected
            </span>
          )}
          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#10B981] transition-all duration-300"
              style={{ width: `${documents.length > 0 ? (completedCount / documents.length) * 100 : 0}%` }}
            />
          </div>
          {/* Delete folder button */}
          {canRemove && onRemoveFolder && documents.length === 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFolder(folderName);
              }}
              className="p-1.5 text-[#6B7280] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove empty folder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Folder Content */}
      {isExpanded && documents.length > 0 && (
        <div className="border-t border-[#E5E7EB]">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors border-b border-[#E5E7EB] last:border-b-0 ${
                selectedDocs.includes(doc.id) ? 'bg-blue-50/50' : ''
              }`}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={selectedDocs.includes(doc.id)}
                onChange={() => onSelectDoc(doc.id)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
              />

              {/* Exhibit Number */}
              <span className="font-mono text-sm text-blue-600 w-14 flex-shrink-0">
                {doc.exhibit_number || '-'}
              </span>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#1A1A1A] truncate" title={doc.file_name}>
                  {doc.file_name}
                </div>
                {doc.exhibit_title && doc.exhibit_title !== doc.file_name && (
                  <div className="text-xs text-[#6B7280] truncate" title={doc.exhibit_title}>
                    {doc.exhibit_title}
                  </div>
                )}
              </div>

              {/* Pages */}
              <span className="text-xs text-[#6B7280] w-16 text-right">
                {doc.page_count || 1} page{(doc.page_count || 1) !== 1 ? 's' : ''}
              </span>

              {/* OCR Status */}
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(doc.ocr_status)}`}>
                {getStatusLabel(doc.ocr_status)}
              </span>

              {/* View Button */}
              <button
                onClick={() => onViewOCR(doc)}
                disabled={doc.ocr_status !== 'completed'}
                className="px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                View
              </button>

              {/* Delete Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`确定要删除文件 "${doc.file_name}" 吗？`)) {
                    onDeleteDoc(doc.id);
                  }
                }}
                className="p-1.5 text-[#6B7280] hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                title="删除文件"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {isExpanded && documents.length === 0 && (
        <div className="px-5 py-8 text-center border-t border-[#E5E7EB]">
          <div className="text-sm text-[#6B7280]">
            No documents yet. Upload files with exhibit "{folderName}-1", "{folderName}-2", etc.
          </div>
        </div>
      )}
    </div>
  );
}
