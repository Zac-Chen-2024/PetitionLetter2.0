import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import type { LetterSection } from '../types';

// ============================================
// Letter Section Component
// ============================================

interface LetterSectionComponentProps {
  section: LetterSection;
  isHighlighted: boolean;
  onHover: (standardId?: string) => void;
  onEdit: (id: string, content: string) => void;
  onSentenceClick?: (snippetIds: string[]) => void;
  highlightedSnippetIds?: string[];
}

function LetterSectionComponent({ section, isHighlighted, onHover, onEdit, onSentenceClick, highlightedSnippetIds = [] }: LetterSectionComponentProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(section.content);
  const [hoveredSentenceIdx, setHoveredSentenceIdx] = useState<number | null>(null);

  const handleSave = () => {
    onEdit(section.id, editContent);
    setIsEditing(false);
  };

  // Render content with sentence-level provenance highlighting
  const renderContent = () => {
    if (!section.sentences || section.sentences.length === 0) {
      // No sentence-level provenance - just render plain text
      return (
        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
          {section.content}
        </p>
      );
    }

    // Render each sentence as a clickable span with provenance info
    return (
      <div className="text-sm text-slate-600 leading-relaxed">
        {section.sentences.map((sentence, idx) => {
          const hasProvenance = sentence.snippet_ids && sentence.snippet_ids.length > 0;
          const isHovered = hoveredSentenceIdx === idx;
          const isHighlightedSentence = hasProvenance &&
            sentence.snippet_ids.some(id => highlightedSnippetIds.includes(id));

          return (
            <span
              key={idx}
              onClick={() => hasProvenance && onSentenceClick?.(sentence.snippet_ids)}
              onMouseEnter={() => setHoveredSentenceIdx(idx)}
              onMouseLeave={() => setHoveredSentenceIdx(null)}
              className={`
                ${hasProvenance ? 'cursor-pointer' : ''}
                ${isHovered && hasProvenance ? 'bg-blue-100 rounded' : ''}
                ${isHighlightedSentence ? 'bg-yellow-100 rounded' : ''}
                transition-colors
              `}
              title={hasProvenance ? `Sources: ${sentence.snippet_ids.length} snippet(s)` : undefined}
            >
              {sentence.text}
              {hasProvenance && (
                <sup className="text-[10px] text-blue-500 ml-0.5">
                  [{sentence.snippet_ids.length}]
                </sup>
              )}
              {' '}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className={`
        p-4 border-b border-slate-200 transition-all
        ${isHighlighted ? 'bg-blue-50 border-l-4 border-l-blue-400' : 'hover:bg-slate-50'}
      `}
      onMouseEnter={() => onHover(section.standardId)}
      onMouseLeave={() => onHover(undefined)}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-800">{section.title}</h3>
        <div className="flex items-center gap-2">
          {section.isGenerated && (
            <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
              {t('writing.aiGenerated')}
            </span>
          )}
          {section.sentences && section.sentences.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              {section.sentences.filter(s => s.snippet_ids?.length > 0).length} sources
            </span>
          )}
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              {t('common.edit')}
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-32 text-sm text-slate-700 border border-slate-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {t('common.save')}
            </button>
            <button
              onClick={() => {
                setEditContent(section.content);
                setIsEditing(false);
              }}
              className="text-xs px-3 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        renderContent()
      )}
    </div>
  );
}

// ============================================
// Letter Panel Component
// ============================================

interface LetterPanelProps {
  className?: string;
}

export function LetterPanel({ className = '' }: LetterPanelProps) {
  const { t } = useTranslation();
  const {
    letterSections,
    updateLetterSection,
    focusState,
  } = useApp();

  const [hoveredStandardId, setHoveredStandardId] = useState<string | undefined>(undefined);
  const [highlightedSnippetIds, setHighlightedSnippetIds] = useState<string[]>([]);

  // Handle sentence click for provenance highlighting
  const handleSentenceClick = useCallback((snippetIds: string[]) => {
    setHighlightedSnippetIds(snippetIds);
    // Auto-clear after 3 seconds
    setTimeout(() => setHighlightedSnippetIds([]), 3000);
  }, []);

  return (
    <div className={`flex flex-col bg-white ${className}`}>
      {/* Letter Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{t('writing.petitionLetter')}</h2>
            <p className="text-xs text-slate-500">{t('writing.eb1aApplication')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              {t('writing.exportWord')}
            </button>
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              {t('writing.exportPdf')}
            </button>
          </div>
        </div>
      </div>

      {/* Letter Content */}
      <div className="flex-1 overflow-y-auto">
        {letterSections.map(section => (
          <LetterSectionComponent
            key={section.id}
            section={section}
            isHighlighted={section.standardId === hoveredStandardId ||
              (focusState.type === 'standard' && section.standardId === focusState.id)}
            onHover={setHoveredStandardId}
            onEdit={updateLetterSection}
            onSentenceClick={handleSentenceClick}
            highlightedSnippetIds={highlightedSnippetIds}
          />
        ))}
      </div>

      {/* Letter Footer */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{t('writing.sections', { count: letterSections.length })}</span>
          <span>
            {t('writing.generatedCount', {
              generated: letterSections.filter(s => s.isGenerated).length,
              pending: letterSections.filter(s => !s.isGenerated).length
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
