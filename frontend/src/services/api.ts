/**
 * API Client - 统一的 HTTP 请求客户端
 */

import { getToken, notifyUnauthorized } from './auth';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

// Backend origin (without /api path) for direct resource URLs (e.g. PDF files)
export const BACKEND_URL = API_BASE.replace(/\/api\/?$/, '');

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

class ApiError extends Error {
  status: number;
  statusText: string;
  data?: unknown;

  constructor(status: number, statusText: string, data?: unknown) {
    super(`API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, signal } = options;

  const token = getToken();
  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    signal,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(response.status, response.statusText, data);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Background jobs (backend M10). Long pipelines return 202 + a job record;
// postJob() submits, polls GET /jobs/{id} (1s -> 5s backoff) and resolves with
// job.result, or rejects on failed/cancelled.
// ---------------------------------------------------------------------------

export interface JobRecord<T = unknown> {
  id: string;
  type: string;
  project_id: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  step: string | null;
  progress: number;          // 0..1
  detail: string | null;
  result: T | null;
  error: string | null;
  created_at: string;
  updated_at?: string;
}

export class JobError extends Error {
  job: JobRecord;
  constructor(job: JobRecord) {
    super(job.status === 'cancelled' ? 'Job cancelled' : (job.error || 'Job failed'));
    this.name = 'JobError';
    this.job = job;
  }
}

export interface PostJobOptions {
  signal?: AbortSignal;
  onProgress?: (job: JobRecord) => void;
  onSubmitted?: (job: JobRecord) => void;
  minIntervalMs?: number;
  maxIntervalMs?: number;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

export async function waitForJob<T>(jobId: string, opts: PostJobOptions = {}): Promise<T> {
  const min = opts.minIntervalMs ?? 1000;
  const max = opts.maxIntervalMs ?? 5000;
  let interval = min;
  for (;;) {
    const job = await request<JobRecord<T>>(`/jobs/${jobId}`, { method: 'GET', signal: opts.signal });
    opts.onProgress?.(job);
    if (job.status === 'succeeded') return job.result as T;
    if (job.status === 'failed' || job.status === 'cancelled') throw new JobError(job);
    await sleep(interval, opts.signal);
    interval = Math.min(max, Math.round(interval * 1.5));
  }
}

export async function cancelJob(jobId: string): Promise<JobRecord> {
  return request<JobRecord>(`/jobs/${jobId}/cancel`, { method: 'POST' });
}

export async function postJob<T>(endpoint: string, body?: unknown, opts: PostJobOptions = {}): Promise<T> {
  const job = await request<JobRecord<T>>(endpoint, { method: 'POST', body, signal: opts.signal });
  opts.onSubmitted?.(job);
  // Fast path: already terminal (e.g. idempotent hit on a finished job)
  if (job.status === 'succeeded') return job.result as T;
  if (job.status === 'failed' || job.status === 'cancelled') throw new JobError(job);
  return waitForJob<T>(job.id, opts);
}

export const apiClient = {
  get: <T>(endpoint: string, options?: { headers?: Record<string, string>; signal?: AbortSignal }) =>
    request<T>(endpoint, { method: 'GET', ...options }),

  post: <T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string>; signal?: AbortSignal }) =>
    request<T>(endpoint, { method: 'POST', body, ...options }),

  put: <T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string>; signal?: AbortSignal }) =>
    request<T>(endpoint, { method: 'PUT', body, ...options }),

  patch: <T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string>; signal?: AbortSignal }) =>
    request<T>(endpoint, { method: 'PATCH', body, ...options }),

  delete: <T>(endpoint: string, options?: { headers?: Record<string, string>; signal?: AbortSignal }) =>
    request<T>(endpoint, { method: 'DELETE', ...options }),

  /** POST that returns a background job; resolves with the job's result. */
  postJob,
  waitForJob,
  cancelJob,
};

export { ApiError };
export default apiClient;
