'use client';

import { ReactNode, useState } from 'react';

interface TabsLayoutProps {
  header: ReactNode;
  documents: ReactNode;
  analysis: ReactNode;
  generate: ReactNode;
}

type Tab = 'documents' | 'analysis' | 'generate';

const TABS: { key: Tab; label: string }[] = [
  { key: 'documents', label: 'Documents' },
  { key: 'analysis', label: 'Evidence Analysis' },
  { key: 'generate', label: 'Generate' },
];

export default function TabsLayout({
  header,
  documents,
  analysis,
  generate,
}: TabsLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('documents');

  const renderContent = () => {
    switch (activeTab) {
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

      {/* Tab Bar */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-16 z-40">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex gap-1">
            {TABS.map((tab, index) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-blue-600'
                    : 'text-[#6B7280] hover:text-[#1A1A1A]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    activeTab === tab.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-[#6B7280]'
                  }`}>
                    {index + 1}
                  </span>
                  {tab.label}
                </span>
                {/* Active indicator */}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {renderContent()}
      </main>
    </div>
  );
}
