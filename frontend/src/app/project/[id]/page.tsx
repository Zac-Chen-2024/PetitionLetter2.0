'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DocumentList from '@/components/DocumentList';
import FileUploader from '@/components/FileUploader';
import AnalysisPanel from '@/components/AnalysisPanel';
import RelationshipPanel, { type RelationshipGraph } from '@/components/RelationshipPanel';
import AnalysisResults from '@/components/AnalysisResults';
import ParagraphGenerator from '@/components/ParagraphGenerator';
import Modal from '@/components/Modal';
import Toast, { ToastType } from '@/components/Toast';
import type { Document, Quote, DocumentAnalysis } from '@/types';
import { documentApi, analysisApi, writingApi, projectApi, relationshipApi, type Project } from '@/utils/api';

// Entity names extracted from relationship analysis
interface EntityNames {
  petitionerName: string;
  foreignEntityName: string;
  beneficiaryName: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // Project info
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);

  // State
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [quotesByStandard, setQuotesByStandard] = useState<Record<string, Quote[]>>({});
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ocrModalDoc, setOcrModalDoc] = useState<Document | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [isSavingBeneficiary, setIsSavingBeneficiary] = useState(false);

  // Entity names from relationship analysis
  const [entityNames, setEntityNames] = useState<EntityNames>({
    petitionerName: '',
    foreignEntityName: '',
    beneficiaryName: '',
  });

  // Load project info, documents and analysis on mount
  useEffect(() => {
    if (projectId) {
      loadProjectInfo();
      loadDocuments();
      loadAnalysisResults();
    }
  }, [projectId]);

  // Load project info (including beneficiary name, petitioner name, foreign entity name)
  const loadProjectInfo = async () => {
    try {
      setProjectLoading(true);
      const projectData = await projectApi.getProject(projectId);
      if (projectData) {
        setProject(projectData);
        if (projectData.beneficiaryName) {
          setBeneficiaryName(projectData.beneficiaryName);
        }
        // Load entity names from project
        setEntityNames({
          petitionerName: projectData.petitionerName || '',
          foreignEntityName: projectData.foreignEntityName || '',
          beneficiaryName: projectData.beneficiaryName || '',
        });
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      // Project might not exist
      router.push('/');
    } finally {
      setProjectLoading(false);
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
      showToast('Failed to save beneficiary name', 'error');
    } finally {
      setIsSavingBeneficiary(false);
    }
  };

  // Load documents
  const loadDocuments = async () => {
    try {
      setLoading(true);
      const result = await documentApi.getDocuments(projectId);
      setDocuments(result.documents || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
      showToast('Failed to load documents', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load analysis results
  const loadAnalysisResults = async () => {
    try {
      const summary = await analysisApi.getSummary(projectId);
      if (summary?.by_standard) {
        setQuotesByStandard(summary.by_standard);
      }
    } catch (error) {
      // No analysis results yet - this is fine
      console.log('No analysis results yet');
    }
  };

  // Handle relationship analysis completion - extract entity names and save to project
  const handleRelationshipAnalysisComplete = useCallback(async (graph: RelationshipGraph) => {
    const entities = graph.entities;

    // Find U.S. Petitioner (Subsidiary)
    const petitioner = entities.find(e =>
      (e.type === 'Organization' || e.type === 'company') &&
      (e.attributes?.role === 'U.S. Petitioner' ||
       e.attributes?.role === 'Subsidiary' ||
       String(e.attributes?.role || '').includes('Petitioner') ||
       String(e.attributes?.role || '').includes('Subsidiary'))
    );

    // Find Foreign Entity (Parent)
    const foreignEntity = entities.find(e =>
      (e.type === 'Organization' || e.type === 'company') &&
      (e.attributes?.role === 'Foreign Parent' ||
       e.attributes?.role === 'Parent Company' ||
       String(e.attributes?.role || '').includes('Parent') ||
       String(e.attributes?.role || '').includes('Foreign'))
    );

    // Find Beneficiary
    const beneficiary = entities.find(e =>
      (e.type === 'Person' || e.type === 'person') &&
      (e.attributes?.role === 'Beneficiary' ||
       String(e.attributes?.role || '').includes('Beneficiary'))
    );

    const newEntityNames = {
      petitionerName: petitioner?.name || '',
      foreignEntityName: foreignEntity?.name || '',
      beneficiaryName: beneficiary?.name || '',
    };

    setEntityNames(newEntityNames);

    // Also update beneficiaryName if found and not already set
    if (beneficiary?.name && !beneficiaryName) {
      setBeneficiaryName(beneficiary.name);
    }

    // Save entity names to project
    try {
      await projectApi.updateProject(projectId, {
        petitionerName: newEntityNames.petitionerName || undefined,
        foreignEntityName: newEntityNames.foreignEntityName || undefined,
        beneficiaryName: newEntityNames.beneficiaryName || undefined,
      });
    } catch (error) {
      console.error('Failed to save entity names:', error);
    }
  }, [beneficiaryName, projectId]);

  // Handle entity names change from ParagraphGenerator
  const handleEntityNamesChange = useCallback(async (petitioner: string, foreignEntity: string) => {
    setEntityNames(prev => ({
      ...prev,
      petitionerName: petitioner,
      foreignEntityName: foreignEntity,
    }));

    // Save to backend
    try {
      await projectApi.updateProject(projectId, {
        petitionerName: petitioner || undefined,
        foreignEntityName: foreignEntity || undefined,
      });
    } catch (error) {
      console.error('Failed to save entity names:', error);
    }
  }, [projectId]);

  // Show toast
  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  // Handle document selection
  const handleSelectDoc = (docId: string) => {
    setSelectedDocs(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedDocs.length === documents.length) {
      setSelectedDocs([]);
    } else {
      setSelectedDocs(documents.map(d => d.id));
    }
  };

  // View OCR
  const handleViewOCR = (doc: Document) => {
    setOcrModalDoc(doc);
  };

  // Handle manual analysis complete
  const handleAnalysisComplete = useCallback(async (results: DocumentAnalysis[]) => {
    try {
      // Save to backend
      await analysisApi.saveManualAnalysis(projectId, results.map(r => ({
        document_id: r.document_id,
        exhibit_id: r.exhibit_id,
        file_name: r.file_name,
        quotes: r.quotes,
      })));

      // Generate summary
      await analysisApi.generateSummary(projectId);

      // Reload results
      await loadAnalysisResults();

      showToast(`Saved ${results.length} document analysis`, 'success');
    } catch (error) {
      console.error('Failed to save analysis:', error);
      showToast('Failed to save analysis', 'error');
    }
  }, [projectId]);

  // Handle auto analysis
  const handleAutoAnalyze = async (docIds: string[]) => {
    try {
      setIsAnalyzing(true);
      const result = await analysisApi.analyzeDocuments(projectId, docIds);

      if (result.success) {
        // Generate summary
        await analysisApi.generateSummary(projectId);

        // Reload results
        await loadAnalysisResults();

        showToast(`Analyzed ${result.total_docs_analyzed} documents, found ${result.total_quotes_found} quotes`, 'success');
      }
    } catch (error) {
      console.error('Auto analysis failed:', error);
      showToast('Auto analysis failed', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle paragraph generation
  const handleGenerateParagraph = async (sectionType: string, beneficiaryNameParam?: string) => {
    try {
      setIsGenerating(true);
      const result = await writingApi.generateParagraph(projectId, sectionType, beneficiaryNameParam);

      if (result.success) {
        return {
          text: result.paragraph.text,
          citations: result.paragraph.citations,
        };
      }
      throw new Error('Generation failed');
    } catch (error) {
      console.error('Generation failed:', error);
      showToast('Paragraph generation failed', 'error');
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  // View document (from analysis results)
  const handleViewDocument = (exhibitId: string) => {
    const doc = documents.find(d => d.exhibit_number === exhibitId);
    if (doc) {
      setOcrModalDoc(doc);
    }
  };

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Project not found</h2>
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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Back Button */}
              <button
                onClick={() => router.push('/')}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to Projects"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {project.name}
                </h1>
                <p className="text-sm text-gray-500">L-1 Visa Evidence Analyzer</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Beneficiary Name Input */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600">Beneficiary:</label>
                <input
                  type="text"
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  onBlur={saveBeneficiaryName}
                  onKeyDown={(e) => e.key === 'Enter' && saveBeneficiaryName()}
                  placeholder="Enter beneficiary name"
                  className="w-40 px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {isSavingBeneficiary && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                )}
              </div>
              <span className="text-xs text-gray-400 font-mono">{projectId}</span>
              <button
                onClick={loadDocuments}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Upload Section */}
        <section>
          <FileUploader
            projectId={projectId}
            onUploadComplete={loadDocuments}
            onError={(msg) => showToast(msg, 'error')}
            onSuccess={(msg) => showToast(msg, 'success')}
          />
        </section>

        {/* Documents Section */}
        <section>
          <DocumentList
            documents={documents}
            selectedDocs={selectedDocs}
            onSelectDoc={handleSelectDoc}
            onSelectAll={handleSelectAll}
            onViewOCR={handleViewOCR}
            loading={loading}
          />
        </section>

        {/* Analysis Section */}
        <section>
          <AnalysisPanel
            documents={documents}
            selectedDocs={selectedDocs}
            onAnalysisComplete={handleAnalysisComplete}
            onAutoAnalyze={handleAutoAnalyze}
            isAnalyzing={isAnalyzing}
          />
        </section>

        {/* Analysis Results Section */}
        <section>
          <AnalysisResults
            quotesByStandard={quotesByStandard}
            documents={documents}
            onViewDocument={handleViewDocument}
          />
        </section>

        {/* Relationship Analysis Section */}
        <section>
          <RelationshipPanel
            projectId={projectId}
            documentsCount={documents.length}
            beneficiaryName={beneficiaryName}
            quotesByStandard={quotesByStandard}
            onError={(msg) => showToast(msg, 'error')}
            onSuccess={(msg) => showToast(msg, 'success')}
            onAnalysisComplete={handleRelationshipAnalysisComplete}
          />
        </section>

        {/* Paragraph Generation Section */}
        <section>
          <ParagraphGenerator
            projectId={projectId}
            onGenerate={handleGenerateParagraph}
            isGenerating={isGenerating}
            beneficiaryName={beneficiaryName}
            quotesByStandard={quotesByStandard}
            initialPetitionerName={entityNames.petitionerName}
            initialForeignEntityName={entityNames.foreignEntityName}
            onEntityNamesChange={handleEntityNamesChange}
          />
        </section>
      </main>

      {/* OCR Modal */}
      <Modal
        isOpen={!!ocrModalDoc}
        onClose={() => setOcrModalDoc(null)}
        title={`OCR Text - ${ocrModalDoc?.exhibit_number || ''}: ${ocrModalDoc?.file_name || ''}`}
        size="xl"
      >
        {ocrModalDoc && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-gray-700">
              <span>Exhibit: {ocrModalDoc.exhibit_number}</span>
              <span>Pages: {ocrModalDoc.page_count}</span>
              <span>~{Math.round((ocrModalDoc.ocr_text?.length || 0) / 4)} tokens</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                {ocrModalDoc.ocr_text || 'No OCR text available'}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(ocrModalDoc.ocr_text || '');
                  showToast('OCR text copied!', 'success');
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Copy OCR Text
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
