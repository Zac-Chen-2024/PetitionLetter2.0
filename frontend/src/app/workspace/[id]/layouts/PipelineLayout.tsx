'use client';

import { ReactNode } from 'react';

interface PipelineLayoutProps {
  header: ReactNode;
  documents: ReactNode;
  highlight: ReactNode;
  analysis: ReactNode;
  generate: ReactNode;
}

export default function PipelineLayout({
  header,
  documents,
  highlight,
  analysis,
  generate,
}: PipelineLayoutProps) {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50">
        {header}
      </div>

      {/* Pipeline Content - Vertical Flow */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="space-y-8">
          {/* Step 1: Documents */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                1
              </div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">Upload Documents</h2>
            </div>
            {documents}
          </section>

          {/* Connector */}
          <div className="flex justify-center">
            <div className="w-px h-8 bg-gray-300"></div>
          </div>

          {/* Step 2: Highlight */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-semibold">
                2
              </div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">Document Highlights</h2>
            </div>
            {highlight}
          </section>

          {/* Connector */}
          <div className="flex justify-center">
            <div className="w-px h-8 bg-gray-300"></div>
          </div>

          {/* Step 3: Analysis */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                3
              </div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">Evidence Analysis</h2>
            </div>
            {analysis}
          </section>

          {/* Connector */}
          <div className="flex justify-center">
            <div className="w-px h-8 bg-gray-300"></div>
          </div>

          {/* Step 4: Generate */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                4
              </div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">Generate Paragraphs</h2>
            </div>
            {generate}
          </section>
        </div>
      </main>
    </div>
  );
}
