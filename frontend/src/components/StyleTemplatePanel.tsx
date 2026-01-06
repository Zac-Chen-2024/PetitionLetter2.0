'use client';

import { useState, useEffect } from 'react';
import { styleTemplateApi, StyleTemplate, ParsedStyleResult } from '@/utils/api';
import { SECTION_TYPES } from '@/utils/prompts';

interface StyleTemplatePanelProps {
  selectedSection: string;
  onTemplateSelect: (template: StyleTemplate | null) => void;
  activeTemplate: StyleTemplate | null;
}

type InputMode = 'auto' | 'manual';

export default function StyleTemplatePanel({
  selectedSection,
  onTemplateSelect,
  activeTemplate,
}: StyleTemplatePanelProps) {
  // State
  const [isExpanded, setIsExpanded] = useState(false);
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('auto');

  // Parse mode state (auto)
  const [sampleText, setSampleText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedStyleResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Manual mode state
  const [manualTemplate, setManualTemplate] = useState('');
  const [manualAnalysis, setManualAnalysis] = useState('');

  // Save mode state
  const [templateName, setTemplateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load templates when section changes
  useEffect(() => {
    loadTemplates();
  }, [selectedSection]);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const result = await styleTemplateApi.list(selectedSection);
      setTemplates(result.templates);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Parse sample text
  const handleParse = async () => {
    if (!sampleText.trim()) return;

    try {
      setIsParsing(true);
      setParseError(null);
      const result = await styleTemplateApi.parse(selectedSection, sampleText);
      setParsedResult(result.parsed);
    } catch (error) {
      setParseError((error as Error).message);
    } finally {
      setIsParsing(false);
    }
  };

  // Save template (auto mode)
  const handleSave = async () => {
    if (!parsedResult || !templateName.trim()) return;

    try {
      setIsSaving(true);
      await styleTemplateApi.create({
        section: selectedSection,
        name: templateName,
        original_text: sampleText,
        parsed_structure: JSON.stringify(parsedResult),
      });

      // Reset and reload
      setSampleText('');
      setParsedResult(null);
      setTemplateName('');
      await loadTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Save template (manual mode)
  const handleSaveManual = async () => {
    if (!manualTemplate.trim() || !templateName.trim()) return;

    try {
      setIsSaving(true);

      // Build parsed structure from manual input
      const parsedStructure: ParsedStyleResult = {
        structure_analysis: manualAnalysis || 'Manually created template',
        template: manualTemplate,
        placeholders: [],
      };

      await styleTemplateApi.create({
        section: selectedSection,
        name: templateName,
        original_text: manualTemplate, // Use template as original text
        parsed_structure: JSON.stringify(parsedStructure),
      });

      // Reset and reload
      setManualTemplate('');
      setManualAnalysis('');
      setTemplateName('');
      await loadTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete template
  const handleDelete = async (templateId: string) => {
    if (!confirm('Delete this template?')) return;

    try {
      await styleTemplateApi.delete(templateId);
      if (activeTemplate?.id === templateId) {
        onTemplateSelect(null);
      }
      await loadTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  // Select template for writing
  const handleSelect = (template: StyleTemplate) => {
    if (activeTemplate?.id === template.id) {
      onTemplateSelect(null); // Deselect
    } else {
      onTemplateSelect(template);
    }
  };

  // Get section label
  const sectionLabel = SECTION_TYPES.find(s => s.key === selectedSection)?.label || selectedSection;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between hover:bg-purple-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <span className="text-sm font-semibold text-purple-900">Style Templates</span>
          {activeTemplate && (
            <span className="px-2 py-0.5 text-xs bg-purple-200 text-purple-800 rounded-full">
              Active: {activeTemplate.name}
            </span>
          )}
          {templates.length > 0 && !activeTemplate && (
            <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
              {templates.length} saved
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-purple-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Info */}
          <div className="text-xs text-gray-600 bg-gray-50 rounded p-3">
            Paste a sample paragraph to extract its writing style. The template will guide LLM to write in a similar structure for <strong>{sectionLabel}</strong>.
          </div>

          {/* Saved Templates */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-700">Saved Templates</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className={`flex items-center justify-between p-2 rounded border ${
                      activeTemplate?.id === tpl.id
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <button
                      onClick={() => handleSelect(tpl)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-medium text-gray-900">{tpl.name}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(tpl.created_at).toLocaleDateString()}
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      {activeTemplate?.id === tpl.id && (
                        <span className="px-2 py-0.5 text-xs bg-purple-600 text-white rounded">
                          Active
                        </span>
                      )}
                      <button
                        onClick={() => handleDelete(tpl.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          {templates.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Create New Template</h4>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setInputMode('auto')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                inputMode === 'auto'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Auto Parse
            </button>
            <button
              onClick={() => setInputMode('manual')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                inputMode === 'manual'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Manual Input
            </button>
          </div>

          {inputMode === 'auto' ? (
            <>
              {/* Input: Sample text */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  Paste Sample Paragraph
                </label>
                <textarea
                  value={sampleText}
                  onChange={(e) => setSampleText(e.target.value)}
                  placeholder="Paste a well-written paragraph from an approved petition letter..."
                  className="w-full h-32 p-3 text-sm border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder:text-gray-400"
                />
              </div>

              {/* Parse button */}
              <div className="flex justify-end">
                <button
                  onClick={handleParse}
                  disabled={!sampleText.trim() || isParsing}
                  className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isParsing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Parsing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Parse Structure
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Manual Input Mode */
            <div className="space-y-3 border border-purple-200 rounded-lg p-4 bg-purple-50/30">
              <div className="text-xs text-gray-600">
                Directly paste or type your template structure with placeholders like [COMPANY_NAME], [DATE], etc.
              </div>

              {/* Template text */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  Template Structure (with placeholders)
                </label>
                <textarea
                  value={manualTemplate}
                  onChange={(e) => setManualTemplate(e.target.value)}
                  placeholder="[COMPANY_NAME], a [STATE] corporation, was established on [DATE] as a wholly-owned subsidiary of [PARENT_COMPANY]..."
                  className="w-full h-32 p-3 text-sm border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder:text-gray-400 font-mono"
                />
              </div>

              {/* Optional: Analysis description */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={manualAnalysis}
                  onChange={(e) => setManualAnalysis(e.target.value)}
                  placeholder="e.g., Formal two-paragraph structure with ownership details first..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder:text-gray-400"
                />
              </div>

              {/* Template name and save */}
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Template name..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder:text-gray-400"
                />
                <button
                  onClick={handleSaveManual}
                  disabled={!manualTemplate.trim() || !templateName.trim() || isSaving}
                  className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
              {parseError}
            </div>
          )}

          {/* Parsed result */}
          {parsedResult && (
            <div className="space-y-3 border border-purple-200 rounded-lg p-4 bg-purple-50/50">
              <h4 className="text-sm font-semibold text-purple-900">Parsed Structure</h4>

              {/* Structure analysis */}
              <div>
                <label className="text-xs font-medium text-gray-600">Analysis</label>
                <p className="text-sm text-gray-800 mt-1">{parsedResult.structure_analysis}</p>
              </div>

              {/* Template */}
              <div>
                <label className="text-xs font-medium text-gray-600">Template with Placeholders</label>
                <div className="mt-1 p-3 bg-white rounded border border-gray-200 text-sm text-gray-800 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {parsedResult.template}
                </div>
              </div>

              {/* Placeholders */}
              {parsedResult.placeholders && parsedResult.placeholders.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Placeholders</label>
                  <div className="mt-1 space-y-1">
                    {parsedResult.placeholders.map((ph, idx) => (
                      <div key={idx} className="text-xs bg-white p-2 rounded border border-gray-200">
                        <span className="font-mono text-purple-600">{ph.name}</span>
                        <span className="text-gray-500 ml-2">- {ph.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Save form */}
              <div className="border-t border-purple-200 pt-3 mt-3">
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  Template Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Formal Corporate Style"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder:text-gray-400"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!templateName.trim() || isSaving}
                    className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save Template
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Discard button */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setParsedResult(null);
                    setTemplateName('');
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
