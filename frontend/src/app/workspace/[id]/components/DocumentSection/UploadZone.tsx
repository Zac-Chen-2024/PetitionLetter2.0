'use client';

import { useState, useCallback, useRef } from 'react';

interface UploadZoneProps {
  projectId: string;
  folders: string[];
  selectedFolder: string;
  onFolderSelect: (folder: string) => void;
  onAddFolder: (folder: string) => void;
  onUploadComplete: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  disabled?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function UploadZone({
  projectId,
  folders,
  selectedFolder,
  onFolderSelect,
  onAddFolder,
  onUploadComplete,
  onError,
  onSuccess,
  disabled = false,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get next folder letter
  const getNextFolderLetter = (): string => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const letter of letters) {
      if (!folders.includes(letter)) {
        return letter;
      }
    }
    // If all letters used, return numbered folder
    let num = 1;
    while (folders.includes(`F${num}`)) {
      num++;
    }
    return `F${num}`;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadFile = async (file: File, folder: string, fileIndex: number) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', projectId);
    // Let backend handle auto-numbering within folder
    formData.append('folder', folder);

    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return response.json();
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (disabled || isUploading) return;

    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      try {
        await uploadFile(file, selectedFolder, i);
        successCount++;
      } catch {
        errorCount++;
      }
      setUploadProgress({ current: i + 1, total: fileArray.length });
    }

    setIsUploading(false);
    setUploadProgress(null);

    if (successCount > 0) {
      onSuccess(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''} to folder ${selectedFolder}`);
      onUploadComplete();
    }
    if (errorCount > 0) {
      onError(`Failed to upload ${errorCount} file${errorCount > 1 ? 's' : ''}`);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [disabled, projectId]);

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleAddFolder = () => {
    const nextLetter = getNextFolderLetter();
    onAddFolder(nextLetter);
    onFolderSelect(nextLetter);
  };

  return (
    <div className="space-y-4">
      {/* Folder Selection */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-[#6B7280] font-medium">Upload to folder:</label>
        <div className="flex gap-2 flex-wrap">
          {folders.map((folder) => (
            <button
              key={folder}
              onClick={() => onFolderSelect(folder)}
              disabled={disabled || isUploading}
              className={`min-w-[40px] h-10 px-3 rounded-lg font-semibold text-sm transition-all ${
                selectedFolder === folder
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'
              } ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {folder}
            </button>
          ))}

          {/* Add folder button */}
          <button
            onClick={handleAddFolder}
            disabled={disabled || isUploading}
            className="w-10 h-10 rounded-lg border-2 border-dashed border-[#E5E7EB] text-[#6B7280] hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center"
            title={`Add folder ${getNextFolderLetter()}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <span className="text-xs text-[#6B7280]">Files will be auto-numbered (e.g., {selectedFolder}-1, {selectedFolder}-2...)</span>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-[#E5E7EB] hover:border-blue-400 hover:bg-gray-50'
        } ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled || isUploading}
        />

        {isUploading ? (
          <div className="space-y-3">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-blue-600 border-t-transparent mx-auto"></div>
            <div className="text-sm text-[#1A1A1A]">
              Uploading {uploadProgress?.current} of {uploadProgress?.total}...
            </div>
            <div className="w-48 h-2 bg-gray-200 rounded-full mx-auto overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${uploadProgress ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="text-sm text-[#1A1A1A] font-medium mb-1">
              Drop files here or click to upload
            </div>
            <div className="text-xs text-[#6B7280]">
              PDF, JPG, PNG supported
            </div>
          </>
        )}
      </div>
    </div>
  );
}
