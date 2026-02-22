import { useState, useCallback } from 'react';
import { apiClient } from '../services/api';

// ============================================
// Types
// ============================================

interface RecommendedSnippet {
  snippet_id: string;
  text: string;
  exhibit_id: string;
  page: number;
  relevance_score: number;
  reason: string;
}

interface CreateSubArgumentModalProps {
  argumentId: string;
  argumentTitle: string;
  standardKey: string;
  projectId: string;
  onConfirm: (data: {
    title: string;
    purpose: string;
    relationship: string;
    snippetIds: string[];
  }) => void;
  onCancel: () => void;
}

// ============================================
// Component
// ============================================

export function CreateSubArgumentModal({
  argumentId,
  argumentTitle,
  standardKey,
  projectId,
  onConfirm,
  onCancel,
}: CreateSubArgumentModalProps) {
  // Step state: 'input' or 'select'
  const [step, setStep] = useState<'input' | 'select'>('input');

  // Form state
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [relationship, setRelationship] = useState('');

  // Snippet selection state
  const [recommendedSnippets, setRecommendedSnippets] = useState<RecommendedSnippet[]>([]);
  const [selectedSnippetIds, setSelectedSnippetIds] = useState<Set<string>>(new Set());

  // Loading/error state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch recommended snippets
  const fetchRecommendations = useCallback(async () => {
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<{
        success: boolean;
        recommended_snippets: RecommendedSnippet[];
        total_available: number;
      }>(`/arguments/${projectId}/recommend-snippets`, {
        argument_id: argumentId,
        title: title.trim(),
        description: purpose.trim() || undefined,
        exclude_snippet_ids: [],
      });

      if (response.success && response.recommended_snippets) {
        setRecommendedSnippets(response.recommended_snippets);
        // Pre-select all recommended snippets
        setSelectedSnippetIds(new Set(response.recommended_snippets.map(s => s.snippet_id)));
        setStep('select');
      } else {
        setError('Failed to get recommendations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recommendations');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, argumentId, title, purpose]);

  // Toggle snippet selection
  const toggleSnippet = useCallback((snippetId: string) => {
    setSelectedSnippetIds(prev => {
      const next = new Set(prev);
      if (next.has(snippetId)) {
        next.delete(snippetId);
      } else {
        next.add(snippetId);
      }
      return next;
    });
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    if (selectedSnippetIds.size === 0) {
      setError('Please select at least one snippet');
      return;
    }

    onConfirm({
      title: title.trim(),
      purpose: purpose.trim(),
      relationship: relationship.trim(),
      snippetIds: Array.from(selectedSnippetIds),
    });
  }, [title, purpose, relationship, selectedSnippetIds, onConfirm]);

  // Go back to input step
  const handleBack = useCallback(() => {
    setStep('input');
    setError(null);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <h3 className="text-lg font-semibold text-slate-800">
            {step === 'input' ? 'Create Sub-Argument' : 'Select Evidence'}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            For: {argumentTitle}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Standard: {standardKey}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 'input' ? (
            <InputStep
              title={title}
              setTitle={setTitle}
              purpose={purpose}
              setPurpose={setPurpose}
              relationship={relationship}
              setRelationship={setRelationship}
              error={error}
            />
          ) : (
            <SelectStep
              snippets={recommendedSnippets}
              selectedIds={selectedSnippetIds}
              onToggle={toggleSnippet}
              error={error}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex justify-between items-center">
            {step === 'select' && (
              <button
                onClick={handleBack}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Back
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              {step === 'input' ? (
                <button
                  onClick={fetchRecommendations}
                  disabled={isLoading || !title.trim()}
                  className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <LoadingSpinner />
                      Finding Snippets...
                    </>
                  ) : (
                    'Find Related Snippets'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={selectedSnippetIds.size === 0}
                  className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create ({selectedSnippetIds.size} selected)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

interface InputStepProps {
  title: string;
  setTitle: (value: string) => void;
  purpose: string;
  setPurpose: (value: string) => void;
  relationship: string;
  setRelationship: (value: string) => void;
  error: string | null;
}

function InputStep({
  title,
  setTitle,
  purpose,
  setPurpose,
  relationship,
  setRelationship,
  error,
}: InputStepProps) {
  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Title Input */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Industry Recognition"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          autoFocus
        />
        <p className="mt-1 text-xs text-slate-400">
          A concise name for this sub-argument
        </p>
      </div>

      {/* Purpose Input */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Purpose <span className="text-slate-400">(optional)</span>
        </label>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="What does this sub-argument demonstrate?"
          rows={2}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Relationship Input */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Relationship <span className="text-slate-400">(optional)</span>
        </label>
        <input
          type="text"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          placeholder="How does this relate to the main argument?"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Info */}
      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
        <p className="text-xs text-purple-700">
          After entering the title, we'll use AI to find the most relevant snippets for this sub-argument.
        </p>
      </div>
    </div>
  );
}

interface SelectStepProps {
  snippets: RecommendedSnippet[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  error: string | null;
}

function SelectStep({
  snippets,
  selectedIds,
  onToggle,
  error,
}: SelectStepProps) {
  if (snippets.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">No related snippets found.</p>
        <p className="text-sm text-slate-400 mt-1">
          Try adjusting the title or description.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <p className="text-sm text-slate-600">
        Select the snippets to include in this sub-argument:
      </p>

      <div className="space-y-2">
        {snippets.map((snippet) => {
          const isSelected = selectedIds.has(snippet.snippet_id);
          return (
            <div
              key={snippet.snippet_id}
              onClick={() => onToggle(snippet.snippet_id)}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                isSelected
                  ? 'border-purple-400 bg-purple-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'border-purple-500 bg-purple-500' : 'border-slate-300'
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                      Exhibit {snippet.exhibit_id}, p.{snippet.page}
                    </span>
                    <span className="text-xs text-green-600 font-medium">
                      {Math.round(snippet.relevance_score * 100)}% match
                    </span>
                  </div>

                  {/* Text */}
                  <p className="text-sm text-slate-700 line-clamp-2">
                    {snippet.text}
                  </p>

                  {/* Reason */}
                  {snippet.reason && (
                    <p className="text-xs text-slate-500 mt-1 italic">
                      {snippet.reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
