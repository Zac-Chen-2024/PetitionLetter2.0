/**
 * Wire -> client model adapters (M11). One place for every conversion.
 */
import type { Argument, ArgumentStatus, LetterSection, Snippet, SubArgument } from '../types';
import { toArgumentClaimType, toProvenanceIndex } from '../types';
import type { BackendArgument, BackendSubArgument, SectionsResponse, UnifiedSnippetAPI } from './types';

const DEFAULT_SNIPPET_COLOR = '#94a3b8';

export function snippetFromAPI(us: UnifiedSnippetAPI): Snippet {
  const page = us.page || 1;
  return {
    id: us.snippet_id,
    documentId: us.document_id || `doc_${us.exhibit_id}`,
    content: us.text,
    summary: us.text.substring(0, 80) + (us.text.length > 80 ? '...' : ''),
    boundingBox: us.bbox ? {
      x: us.bbox.x1,
      y: us.bbox.y1,
      width: us.bbox.x2 - us.bbox.x1,
      height: us.bbox.y2 - us.bbox.y1,
      page,
    } : { x: 0, y: 0, width: 100, height: 50, page },
    materialType: 'other',
    color: DEFAULT_SNIPPET_COLOR,
    exhibitId: us.exhibit_id,
    page,
    subject: us.subject,
    subjectRole: us.subject_role,
    isApplicantAchievement: us.is_applicant_achievement,
    evidenceType: us.evidence_type,
  };
}

export function argumentsFromAPI(args: BackendArgument[]): Argument[] {
  return args.map((arg) => ({
    id: arg.id,
    title: arg.title,
    subject: arg.subject,
    snippetIds: arg.snippet_ids,
    standardKey: arg.standard_key,
    claimType: toArgumentClaimType(arg.standard_key),
    status: 'draft' as ArgumentStatus,
    isAIGenerated: arg.is_ai_generated,
    subArgumentIds: arg.sub_argument_ids || [],
    createdAt: new Date(arg.created_at),
    updatedAt: new Date(),
    exhibits: arg.exhibits,
    layers: arg.layers,
    conclusion: arg.conclusion,
    completeness: arg.completeness,
  }));
}

export function subArgumentsFromAPI(subArgs: BackendSubArgument[]): SubArgument[] {
  return subArgs.map((sa) => ({
    id: sa.id,
    argumentId: sa.argument_id,
    title: sa.title,
    purpose: sa.purpose,
    relationship: sa.relationship,
    snippetIds: sa.snippet_ids,
    pendingSnippetIds: sa.pending_snippet_ids || [],
    needsSnippetConfirmation: sa.needs_snippet_confirmation || false,
    isAIGenerated: sa.is_ai_generated,
    status: sa.status as 'draft' | 'verified',
    createdAt: new Date(sa.created_at),
    updatedAt: new Date(),
  }));
}

export function sectionTitle(standardKey: string): string {
  return standardKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function sectionsFromAPI(resp: SectionsResponse): LetterSection[] {
  return (resp.sections || []).map((s, i) => ({
    id: `section-${s.section}`,
    title: sectionTitle(s.section),
    standardId: s.section,
    content: s.paragraph_text,
    isGenerated: true,
    order: i,
    sentences: s.sentences,
    provenanceIndex: toProvenanceIndex(s.provenance_index),
  }));
}
