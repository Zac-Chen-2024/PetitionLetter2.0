/**
 * Interaction Logger (Doc/01 M6, plan 0.3).
 *
 * Records user interactions for the study and ships them to
 * POST /api/logs/interactions in batches.
 *
 * Schema (fixed -- analysis scripts key on it):
 *   {ts, session_id, project_id, event, panel, payload}
 *
 * Delivery:
 *   - flush every FLUSH_INTERVAL_MS or when BATCH_SIZE records are buffered
 *   - on visibilitychange(hidden) / pagehide: navigator.sendBeacon() with a
 *     text/plain body (a JSON blob would need a preflight that beacons cannot
 *     do); token goes in ?token= because beacons cannot set headers
 *   - buffer is mirrored to localStorage so a crash/refresh keeps unsent
 *     records; they are merged into the next flush
 */

import { API_BASE } from './api';
import { getToken } from './auth';

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

const STORAGE_KEY = 'pl_interaction_logs_v2';
const SESSION_KEY = 'pl_interaction_session';
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 30_000;

function endpoint(): string {
  const t = getToken();
  return `${API_BASE}/logs/interactions${t ? `?token=${encodeURIComponent(t)}` : ''}`;
}

class InteractionLoggerService {
  private buffer: InteractionLog[] = [];
  private sessionId: string;
  private projectId: string | null = null;
  private flushing = false;
  private lastByKey = new Map<string, number>(); // throttle bookkeeping

  constructor() {
    this.sessionId = this.restoreOrCreateSession();
    this.restoreBuffer();
    if (typeof window !== 'undefined') {
      window.setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.beacon();
      });
      window.addEventListener('pagehide', () => this.beacon());
    }
  }

  // ---- session / project ------------------------------------------------

  private restoreOrCreateSession(): string {
    // One session per browser tab (sessionStorage), survives reloads of that tab.
    try {
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      sessionStorage.setItem(SESSION_KEY, id);
      return id;
    } catch {
      return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }
  }

  setProjectId(projectId: string | null): void {
    this.projectId = projectId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getProjectId(): string | null {
    return this.projectId;
  }

  // ---- recording -----------------------------------------------------------

  log(event: EventType, panel: PanelName = 'other', payload: Record<string, unknown> = {}): void {
    this.buffer.push({
      ts: Date.now(),
      session_id: this.sessionId,
      project_id: this.projectId,
      event,
      panel,
      payload,
    });
    this.persistBuffer();
    if (this.buffer.length >= BATCH_SIZE) void this.flush();
  }

  /** log() at most once per `everyMs` for the same key (hover / scroll streams). */
  logThrottled(key: string, everyMs: number, event: EventType, panel: PanelName, payload: Record<string, unknown> = {}): void {
    const now = Date.now();
    const last = this.lastByKey.get(key) ?? 0;
    if (now - last < everyMs) return;
    this.lastByKey.set(key, now);
    this.log(event, panel, payload);
  }

  // ---- delivery ------------------------------------------------------------

  private persistBuffer(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.buffer));
    } catch {
      /* quota / private mode: keep in memory only */
    }
  }

  private restoreBuffer(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.buffer = parsed;
      }
    } catch {
      this.buffer = [];
    }
  }

  private takeBatch(): InteractionLog[] {
    const batch = this.buffer;
    this.buffer = [];
    this.persistBuffer();
    return batch;
  }

  private restoreBatch(batch: InteractionLog[]): void {
    // Failed upload: put the records back in front of anything logged meanwhile.
    this.buffer = [...batch, ...this.buffer];
    this.persistBuffer();
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.takeBatch();
    try {
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: this.sessionId, project_id: this.projectId, logs: batch }),
        keepalive: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn('[InteractionLogger] flush failed, will retry:', e);
      this.restoreBatch(batch);
    } finally {
      this.flushing = false;
    }
  }

  /** Last-chance delivery when the page is going away. */
  private beacon(): void {
    if (this.buffer.length === 0 || typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    const batch = this.takeBatch();
    const body = JSON.stringify({ session_id: this.sessionId, project_id: this.projectId, logs: batch });
    const ok = navigator.sendBeacon(endpoint(), new Blob([body], { type: 'text/plain' }));
    if (!ok) this.restoreBatch(batch);
  }

  // ---- introspection (dev tools) ------------------------------------------

  pending(): number {
    return this.buffer.length;
  }
}

export const interactionLogger = new InteractionLoggerService();

export const logInteraction = (
  event: EventType,
  panel: PanelName = 'other',
  payload: Record<string, unknown> = {},
) => interactionLogger.log(event, panel, payload);

export const logThrottled = (
  key: string,
  everyMs: number,
  event: EventType,
  panel: PanelName,
  payload: Record<string, unknown> = {},
) => interactionLogger.logThrottled(key, everyMs, event, panel, payload);

export default interactionLogger;
