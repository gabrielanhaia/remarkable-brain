/**
 * Typed fetch helpers for the rm-brain read-only web API. One function per endpoint. All are GET.
 * Requests are same-origin (`/api/...`); in dev, Vite proxies them to `rm-brain web` on :4123.
 */
import type {
  EntitySummary,
  NotebookDetail,
  NotebookSummary,
  Overview,
  PageDetail,
  SearchFilters,
  SearchResult,
  TimelineEntry,
  OpenLoop,
  ApiError,
} from './types.js';

/** Thrown for any non-2xx response; carries the HTTP status and server-provided message. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** True for the friendly empty-index state (503 "run `rm-brain sync` first"). */
  get isEmptyIndex(): boolean {
    return this.status === 503;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as ApiError;
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError(res.status, message);
  }
  return (await res.json()) as T;
}

export function getOverview(): Promise<Overview> {
  return getJson<Overview>('/api/overview');
}

export function listNotebooks(): Promise<NotebookSummary[]> {
  return getJson<NotebookSummary[]>('/api/notebooks');
}

export function getNotebook(id: string): Promise<NotebookDetail> {
  return getJson<NotebookDetail>(`/api/notebooks/${encodeURIComponent(id)}`);
}

export function getPage(id: string): Promise<PageDetail> {
  return getJson<PageDetail>(`/api/pages/${encodeURIComponent(id)}`);
}

export function search(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (filters?.notebook) params.set('notebook', filters.notebook);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.openLoop) params.set('open_loop', '1');
  return getJson<SearchResult[]>(`/api/search?${params.toString()}`);
}

export function getOpenLoops(limit?: number): Promise<OpenLoop[]> {
  const qs = limit ? `?limit=${limit}` : '';
  return getJson<OpenLoop[]>(`/api/open-loops${qs}`);
}

export function listEntities(): Promise<EntitySummary[]> {
  return getJson<EntitySummary[]>('/api/entities');
}

export function getEntityTimeline(name: string): Promise<TimelineEntry[]> {
  return getJson<TimelineEntry[]>(`/api/entities/${encodeURIComponent(name)}/timeline`);
}

/**
 * Build the browser URL for a page's scanned image from its page id. Page ids are
 * `"<notebookId>:<pageNumber>"` (see sync); images are served at `/images/:notebookId/page-<n>.png`.
 * Prefer the `imageUrl` field returned by the API when available; use this only when you have just
 * a page id (e.g. a `SearchHit`, which carries no image field).
 */
export function pageImageUrl(pageId: string): string | null {
  const idx = pageId.lastIndexOf(':');
  if (idx <= 0) return null;
  const notebookId = pageId.slice(0, idx);
  const pageNumber = pageId.slice(idx + 1);
  if (!notebookId || !pageNumber) return null;
  return `/images/${encodeURIComponent(notebookId)}/page-${encodeURIComponent(pageNumber)}.png`;
}
