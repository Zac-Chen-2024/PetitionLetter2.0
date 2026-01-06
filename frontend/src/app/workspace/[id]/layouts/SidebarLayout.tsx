'use client';

import { ReactNode, useState } from 'react';

interface SidebarLayoutProps {
  header: ReactNode;
  documents: ReactNode;
  analysis: ReactNode;
  generate: ReactNode;
}

type Section = 'documents' | 'analysis' | 'generate';

const NAV_ITEMS: { key: Section; label: string; icon: ReactNode }[] = [
  {
    key: 'documents',
    label: 'Documents',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    key: 'analysis',
    label: 'Analysis',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: 'generate',
    label: 'Generate',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
];

export default function SidebarLayout({
  header,
  documents,
  analysis,
  generate,
}: SidebarLayoutProps) {
  const [activeSection, setActiveSection] = useState<Section>('documents');

  const renderContent = () => {
    switch (activeSection) {
      case 'documents':
        return documents;
      case 'analysis':
        return analysis;
      case 'generate':
        return generate;
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header */}
      <div className="sticky top-0 z-50">
        {header}
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-[calc(100vh-64px)] bg-white border-r border-[#E5E7EB] sticky top-16 self-start">
          <nav className="p-4 space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                  activeSection === item.key
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-[#6B7280] hover:bg-gray-50 hover:text-[#1A1A1A]'
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
                {activeSection === item.key && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                )}
              </button>
            ))}
          </nav>

          {/* Progress indicator */}
          <div className="p-4 border-t border-[#E5E7EB] mt-4">
            <div className="text-xs text-[#6B7280] mb-2">Progress</div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${activeSection === 'documents' || activeSection === 'analysis' || activeSection === 'generate' ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
              <div className="flex-1 h-0.5 bg-gray-200">
                <div className={`h-full bg-blue-600 transition-all ${activeSection === 'documents' ? 'w-0' : activeSection === 'analysis' ? 'w-1/2' : 'w-full'}`}></div>
              </div>
              <div className={`w-3 h-3 rounded-full ${activeSection === 'analysis' || activeSection === 'generate' ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
              <div className="flex-1 h-0.5 bg-gray-200">
                <div className={`h-full bg-blue-600 transition-all ${activeSection === 'generate' ? 'w-full' : 'w-0'}`}></div>
              </div>
              <div className={`w-3 h-3 rounded-full ${activeSection === 'generate' ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          <div className="max-w-5xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
