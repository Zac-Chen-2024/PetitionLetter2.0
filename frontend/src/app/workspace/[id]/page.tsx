'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { documentApi, analysisApi, projectApi, type Project } from '@/utils/api';
import type { Document, Quote } from '@/types';
import Toast, { ToastType } from '@/components/Toast';

// Layout components
import PipelineLayout from './layouts/PipelineLayout';
import SidebarLayout from './layouts/SidebarLayout';
import TabsLayout from './layouts/TabsLayout';

// Section components
import WorkspaceHeader from './components/WorkspaceHeader';
import DocumentSection from './components/DocumentSection';
import AnalysisSection from './components/AnalysisSection';
import GenerateSection from './components/GenerateSection';
import HighlightSection from './components/HighlightSection';
import HighlightModal from './components/PdfHighlight/HighlightModal';
import ProjectSidebar from './components/ProjectSidebar';

import type { LayoutMode } from './components/LayoutSwitcher';

export default function WorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // Project state
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [isSavingBeneficiary, setIsSavingBeneficiary] = useState(false);

  // Entity names
  const [petitionerName, setPetitionerName] = useState('');
  const [foreignEntityName, setForeignEntityName] = useState('');

  // Document state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);

  // Analysis state
  const [quotesByStandard, setQuotesByStandard] = useState<Record<string, Quote[]>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // PDF highlight modal
  const [highlightQuote, setHighlightQuote] = useState<Quote | null>(null);
  const [highlightDocText, setHighlightDocText] = useState<string>('');

  // Layout state
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('pipeline');

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Load all data on mount
  useEffect(() => {
    console.log('[DEBUG] useEffect triggered, projectId:', projectId);
    if (projectId) {
      console.log('[DEBUG] Calling loadProject...');
      loadProject();
      loadDocuments();
      loadAnalysis();
    }
  }, [projectId]);

  // Load project info
  const loadProject = async () => {
    try {
      console.log('[DEBUG] loadProject started, calling API...');
      setProjectLoading(true);
      const data = await projectApi.getProject(projectId);
      console.log('[DEBUG] loadProject got data:', data);
      setProject(data);
      if (data.beneficiaryName) setBeneficiaryName(data.beneficiaryName);
      if (data.petitionerName) setPetitionerName(data.petitionerName);
      if (data.foreignEntityName) setForeignEntityName(data.foreignEntityName);
    } catch (error) {
      console.error('Failed to load project:', error);
      router.push('/');
    } finally {
      setProjectLoading(false);
    }
  };

  // Load documents
  const loadDocuments = async () => {
    try {
      setDocumentsLoading(true);
      const result = await documentApi.getDocuments(projectId);
      setDocuments(result.documents || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
      showToast('Failed to load documents', 'error');
    } finally {
      setDocumentsLoading(false);
    }
  };

  // Load analysis results
  const loadAnalysis = async () => {
    try {
      const summary = await analysisApi.getSummary(projectId);
      if (summary?.by_standard) {
        setQuotesByStandard(summary.by_standard);
      }
    } catch {
      // No analysis yet - that's fine
    }
  };

  // Save beneficiary name
  const saveBeneficiaryName = async () => {
    if (!beneficiaryName.trim()) return;
    try {
      setIsSavingBeneficiary(true);
      await projectApi.updateProject(projectId, { beneficiaryName: beneficiaryName.trim() });
      showToast('Beneficiary name saved', 'success');
    } catch (error) {
      console.error('Failed to save beneficiary name:', error);
      showToast('Failed to save', 'error');
    } finally {
      setIsSavingBeneficiary(false);
    }
  };

  // Save entity names
  const saveEntityNames = async () => {
    try {
      await projectApi.updateProject(projectId, {
        petitionerName: petitionerName || undefined,
        foreignEntityName: foreignEntityName || undefined,
      });
    } catch (error) {
      console.error('Failed to save entity names:', error);
    }
  };

  // Toast helper
  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  // Document selection
  const handleSelectDoc = (docId: string) => {
    setSelectedDocs(prev =>
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const handleSelectAll = () => {
    if (selectedDocs.length === documents.length) {
      setSelectedDocs([]);
    } else {
      setSelectedDocs(documents.map(d => d.id));
    }
  };

  // Run analysis
  const handleRunAnalysis = async (docIds: string[]) => {
    try {
      setIsAnalyzing(true);
      const result = await analysisApi.analyzeDocuments(projectId, docIds);

      if (result.success) {
        await analysisApi.generateSummary(projectId);
        await loadAnalysis();
        showToast(`Analyzed ${result.total_docs_analyzed} docs, found ${result.total_quotes_found} quotes`, 'success');
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      showToast('Analysis failed', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // View quote in PDF
  const handleViewQuote = useCallback((quote: Quote) => {
    // Find the document OCR text
    const doc = documents.find(d => d.exhibit_number === quote.source.exhibit_id);
    setHighlightQuote(quote);
    setHighlightDocText(doc?.ocr_text || '');
  }, [documents]);

  // Loading state
  if (projectLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
          <span className="text-[#6B7280]">Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[#1A1A1A]">Project not found</h2>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  // Header component
  const header = (
    <WorkspaceHeader
      projectName={project.name}
      projectId={projectId}
      beneficiaryName={beneficiaryName}
      onBeneficiaryChange={setBeneficiaryName}
      onBeneficiarySave={saveBeneficiaryName}
      isSaving={isSavingBeneficiary}
      layoutMode={layoutMode}
      onLayoutChange={setLayoutMode}
    />
  );

  // Document section
  const documentSection = (
    <DocumentSection
      projectId={projectId}
      documents={documents}
      selectedDocs={selectedDocs}
      onSelectDoc={handleSelectDoc}
      onSelectAll={handleSelectAll}
      onRefresh={loadDocuments}
      onError={(msg) => showToast(msg, 'error')}
      onSuccess={(msg) => showToast(msg, 'success')}
      loading={documentsLoading}
    />
  );

  // Analysis section
  const analysisSection = (
    <AnalysisSection
      projectId={projectId}
      documents={documents}
      selectedDocs={selectedDocs}
      quotesByStandard={quotesByStandard}
      onRunAnalysis={handleRunAnalysis}
      isAnalyzing={isAnalyzing}
      onViewQuote={handleViewQuote}
    />
  );

  // Generate section
  const generateSection = (
    <GenerateSection
      projectId={projectId}
      quotesByStandard={quotesByStandard}
      beneficiaryName={beneficiaryName}
      petitionerName={petitionerName}
      foreignEntityName={foreignEntityName}
      onPetitionerChange={setPetitionerName}
      onForeignEntityChange={setForeignEntityName}
      onEntitySave={saveEntityNames}
      onViewQuote={handleViewQuote}
    />
  );

  // Highlight section
  const highlightSection = (
    <HighlightSection
      projectId={projectId}
      documents={documents}
      onError={(msg) => showToast(msg, 'error')}
      onSuccess={(msg) => showToast(msg, 'success')}
    />
  );

  // Render layout based on mode
  const renderLayout = () => {
    const layoutProps = {
      header,
      documents: documentSection,
      analysis: analysisSection,
      generate: generateSection,
      highlight: highlightSection,
    };

    switch (layoutMode) {
      case 'sidebar':
        return <SidebarLayout {...layoutProps} />;
      case 'tabs':
        return <TabsLayout {...layoutProps} />;
      default:
        return <PipelineLayout {...layoutProps} />;
    }
  };

  return (
    <>
      {/* Project Sidebar */}
      <ProjectSidebar
        currentProjectId={projectId}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content with margin adjustment for sidebar */}
      <div
        className="transition-all duration-300"
        style={{ marginLeft: sidebarCollapsed ? 0 : 280 }}
      >
        {renderLayout()}
      </div>

      {/* PDF Highlight Modal */}
      <HighlightModal
        isOpen={!!highlightQuote}
        onClose={() => setHighlightQuote(null)}
        quote={highlightQuote}
        documentOcrText={highlightDocText}
      />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
