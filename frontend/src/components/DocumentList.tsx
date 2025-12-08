'use client';

import { useState, useMemo } from 'react';
import type { Document } from '@/types';

interface DocumentListProps {
  documents: Document[];
  selectedDocs: string[];
  onSelectDoc: (docId: string) => void;
  onSelectAll: () => void;
  onViewOCR: (doc: Document) => void;
  loading?: boolean;
}

// Default folders - A, B, C initially, can add more
const DEFAULT_FOLDERS = ['A', 'B', 'C'];

// Extract folder letter from exhibit number (e.g., "A-1" -> "A")
const getFolderFromExhibit = (exhibitNumber: string | null | undefined): string => {
  if (!exhibitNumber) return 'Other';
  const match = exhibitNumber.match(/^([A-Z])-\d+$/i);
  return match ? match[1].toUpperCase() : 'Other';
};

// Folder component
function DocumentFolder({
  folderName,
  documents,
  selectedDocs,
  onSelectDoc,
  onViewOCR,
  defaultExpanded = true,
}: {
  folderName: string;
  documents: Document[];
  selectedDocs: string[];
  onSelectDoc: (docId: string) => void;
  onViewOCR: (doc: Document) => void;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const folderSelectedCount = documents.filter(d => selectedDocs.includes(d.id)).length;
  const completedCount = documents.filter(d => d.ocr_status === 'completed').length;

  const getStatusBadge = (status: string) => {
    const styles = {
      completed: 'bg-green-100 text-green-800',
      processing: 'bg-yellow-100 text-yellow-800',
      pending: 'bg-gray-100 text-gray-800',
      failed: 'bg-red-100 text-red-800',
    };
    const labels = {
      completed: 'Completed',
      processing: 'Processing...',
      pending: 'Pending',
      failed: 'Failed',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[status as keyof typeof styles] || styles.pending}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Folder Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
          <span className="font-semibold text-gray-900">Folder {folderName}</span>
          <span className="text-sm text-gray-600">({documents.length} files)</span>
        </div>
        <div className="flex items-center gap-3">
          {folderSelectedCount > 0 && (
            <span className="text-xs text-blue-600 font-medium">{folderSelectedCount} selected</span>
          )}
          <span className="text-xs text-gray-600">
            {completedCount}/{documents.length} OCR done
          </span>
        </div>
      </button>

      {/* Folder Content */}
      {isExpanded && documents.length > 0 && (
        <div className="divide-y divide-gray-100">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${
                selectedDocs.includes(doc.id) ? 'bg-blue-50' : ''
              }`}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={selectedDocs.includes(doc.id)}
                onChange={() => onSelectDoc(doc.id)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />

              {/* Exhibit Number */}
              <span className="font-mono text-sm text-blue-600 w-12">
                {doc.exhibit_number || '-'}
              </span>

              {/* File Name */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 truncate" title={doc.file_name}>
                  {doc.file_name}
                </div>
                {doc.exhibit_title && doc.exhibit_title !== doc.file_name && (
                  <div className="text-xs text-gray-600 truncate" title={doc.exhibit_title}>
                    {doc.exhibit_title}
                  </div>
                )}
              </div>

              {/* Pages */}
              <span className="text-xs text-gray-600 w-12 text-center">
                {doc.page_count || 1} pg
              </span>

              {/* OCR Status */}
              <div className="w-24">
                {getStatusBadge(doc.ocr_status)}
              </div>

              {/* View OCR Button */}
              <button
                onClick={() => onViewOCR(doc)}
                disabled={doc.ocr_status !== 'completed'}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed px-2 py-1"
              >
                View
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty folder message */}
      {isExpanded && documents.length === 0 && (
        <div className="px-4 py-6 text-center text-gray-500 text-sm">
          No documents in this folder. Upload files with exhibit numbers starting with "{folderName}-".
        </div>
      )}
    </div>
  );
}

export default function DocumentList({
  documents,
  selectedDocs,
  onSelectDoc,
  onSelectAll,
  onViewOCR,
  loading = false,
}: DocumentListProps) {
  // Group documents by folder
  const documentsByFolder = useMemo(() => {
    const grouped: Record<string, Document[]> = {};

    // Initialize default folders
    DEFAULT_FOLDERS.forEach(folder => {
      grouped[folder] = [];
    });

    // Group documents
    documents.forEach(doc => {
      const folder = getFolderFromExhibit(doc.exhibit_number);
      if (!grouped[folder]) {
        grouped[folder] = [];
      }
      grouped[folder].push(doc);
    });

    // Sort documents within each folder by exhibit number
    Object.keys(grouped).forEach(folder => {
      grouped[folder].sort((a, b) => {
        const aNum = parseInt(a.exhibit_number?.match(/-(\d+)$/)?.[1] || '0');
        const bNum = parseInt(b.exhibit_number?.match(/-(\d+)$/)?.[1] || '0');
        return aNum - bNum;
      });
    });

    return grouped;
  }, [documents]);

  // Get all folder names (default + any additional from documents)
  const allFolders = useMemo(() => {
    const folders = new Set(DEFAULT_FOLDERS);
    Object.keys(documentsByFolder).forEach(folder => folders.add(folder));
    // Sort folders: A, B, C... then Other at the end
    return Array.from(folders).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
  }, [documentsByFolder]);

  const allSelected = documents.length > 0 && selectedDocs.length === documents.length;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-800">Loading documents...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onSelectAll}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <h3 className="text-sm font-semibold text-gray-900">
              Documents ({documents.length})
            </h3>
          </div>
          <span className="text-sm text-gray-700 font-medium">
            {selectedDocs.length} selected
          </span>
        </div>
      </div>

      {/* Folders */}
      <div className="p-4 space-y-3">
        {allFolders.map(folder => (
          <DocumentFolder
            key={folder}
            folderName={folder}
            documents={documentsByFolder[folder] || []}
            selectedDocs={selectedDocs}
            onSelectDoc={onSelectDoc}
            onViewOCR={onViewOCR}
            defaultExpanded={false}
          />
        ))}

        {documents.length === 0 && (
          <div className="text-center py-8 text-gray-600">
            No documents yet. Upload files to get started.
          </div>
        )}
      </div>
    </div>
  );
}
