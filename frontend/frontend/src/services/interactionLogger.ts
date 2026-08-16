/**
 * Interaction Logger - 交互日志记录服务
 *
 * M1 (Doc/03): the previous event vocabulary belonged to the old Condition A/B
 * study and had no live callers. This module is a minimal placeholder that
 * keeps the public surface (`logInteraction`, `interactionLogger`) so that
 * M6 can implement the real schema {ts, session_id, project_id, event, panel,
 * payload} without touching call sites again.
 */

export type EventType =
  | 'node_create'
  | 'node_rename'
  | 'node_move'
  | 'node_merge'
  | 'node_delete'
  | 'snippet_assign'
  | 'snippet_unassign'
  | 'generate_trigger'
  | 'citation_click'
  | 'bbox_hover'
  | 'pdf_scroll'
  | 'letter_edit'
  | 'panel_focus';

export type PanelName = 'evidence' | 'pdf' | 'tree' | 'letter' | 'header' | 'other';

export interface InteractionLog {
  ts: number;
  session_id: string;
  project_id: string | null;
  event: EventType;
  panel: PanelName;
  payload: Record<string, unknown>;
}

class InteractionLoggerService {
  private sessionId: string;
  private projectId: string | null = null;

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  setProjectId(projectId: string | null): void {
    this.projectId = projectId;
  }

  getProjectId(): string | null {
    return this.projectId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // M6 replaces this with buffering + flush + sendBeacon.
  log(event: EventType, panel: PanelName = 'other', payload: Record<string, unknown> = {}): void {
    void event; void panel; void payload;
  }

  async flush(): Promise<void> {
    /* implemented in M6 */
  }
}

export const interactionLogger = new InteractionLoggerService();

export const logInteraction = (
  event: EventType,
  panel: PanelName = 'other',
  payload: Record<string, unknown> = {},
) => interactionLogger.log(event, panel, payload);

export default interactionLogger;
