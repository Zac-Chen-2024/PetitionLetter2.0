import { Component, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppProvider, useApp } from './context/AppContext';
import {
  Header,
  DocumentViewer,
  EvidenceCardPool,
  ConnectionLines,
  SankeyView,
  MaterialOrganization,
  WritingCanvas,
  LanguageSwitcher,
  ArgumentGraph,
} from './components';
import { LetterPanel } from './components/LetterPanel';

// Error Boundary for debugging
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 text-red-800">
          <h2 className="text-lg font-bold mb-2">Component Error</h2>
          <pre className="text-sm bg-red-100 p-4 rounded overflow-auto">
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { viewMode, currentPage, setCurrentPage, workMode } = useApp();
  const { t } = useTranslation();

  // Render the appropriate view based on viewMode and workMode
  const renderMappingView = () => {
    switch (viewMode) {
      case 'sankey':
        return (
          <div className="flex-1 overflow-hidden bg-white relative">
            <SankeyView />
          </div>
        );
      case 'line':
      default:
        // Write mode: Evidence Cards + PDF (split) | Writing Tree | Letter Panel
        if (workMode === 'write') {
          return (
            <>
              {/* Panel: Evidence Cards + PDF Preview (split vertically) */}
              <div className="w-[20%] flex-shrink-0 border-r border-slate-200 overflow-hidden flex flex-col">
                {/* Top: Evidence Cards (50%) */}
                <div className="h-1/2 border-b border-slate-200 overflow-hidden">
                  <EvidenceCardPool />
                </div>
                {/* Bottom: PDF Preview (50%) */}
                <div className="h-1/2 overflow-hidden">
                  <DocumentViewer compact />
                </div>
              </div>

              {/* Panel: Writing Tree (flex) */}
              <div className="flex-1 bg-white overflow-hidden">
                <ArgumentGraph />
              </div>

              {/* Panel: Letter Panel (480px) */}
              <div className="w-[480px] flex-shrink-0 border-l border-slate-200 overflow-hidden">
                <LetterPanel className="h-full" />
              </div>

              {/* SVG Connection Lines (rendered on top) */}
              <ConnectionLines />
            </>
          );
        }

        // Verify mode (default): Document Viewer | Evidence Cards | Writing Tree
        return (
          <>
            {/* Panel 2: Evidence Cards (20%) */}
            <div className="w-[20%] flex-shrink-0 border-r border-slate-200 overflow-hidden">
              <EvidenceCardPool />
            </div>

            {/* Panel 3: Writing Tree (60%) */}
            <div className="w-[60%] flex-shrink-0 bg-white overflow-hidden">
              <ArgumentGraph />
            </div>

            {/* SVG Connection Lines (rendered on top) */}
            <ConnectionLines />
          </>
        );
    }
  };

  // If on materials page, render MaterialOrganization
  if (currentPage === 'materials') {
    return (
      <div className="flex flex-col h-screen">
        {/* Page navigation */}
        <div className="flex-shrink-0 px-4 py-2 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentPage('mapping')}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              ← {t('nav.backToMapping')}
            </button>
            <span className="text-sm font-medium">{t('nav.materials')}</span>
          </div>
          <LanguageSwitcher />
        </div>
        <div className="flex-1 overflow-hidden">
          <MaterialOrganization />
        </div>
      </div>
    );
  }

  // If on writing page, render WritingCanvas
  if (currentPage === 'writing') {
    return (
      <div className="flex flex-col h-screen">
        {/* Page navigation */}
        <div className="flex-shrink-0 px-4 py-2 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentPage('mapping')}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              ← {t('nav.backToMapping')}
            </button>
            <span className="text-sm font-medium">{t('nav.writingCanvas')}</span>
          </div>
          <LanguageSwitcher />
        </div>
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary>
            <WritingCanvas />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Header */}
      <Header />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Panel 1: Document Viewer (20%) - only in Verify mode */}
        {workMode === 'verify' && (
          <div className="w-[20%] flex-shrink-0 border-r border-slate-200 bg-white overflow-hidden relative z-0 transition-all duration-300">
            <DocumentViewer />
          </div>
        )}

        {/* Right side: changes based on view mode and work mode */}
        {renderMappingView()}
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
