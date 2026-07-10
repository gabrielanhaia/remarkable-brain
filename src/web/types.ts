/**
 * Shared HTTP response types for the read-only rm-brain web API.
 *
 * This file is the SERVER-SIDE source of truth for the API contract. It is mirrored, verbatim,
 * by `web/src/api/types.ts` on the frontend — keep the two in sync. Types that already exist on
 * the Repo (`SearchHit`, `PageFull`, `TimelineEntry`, `OpenLoop`) are re-exported here so both
 * the server handlers and the frontend import a single named type per concept.
 *
 * Image note: DB rows carry `imagePath` as an ABSOLUTE on-disk path. Handlers additionally expose
 * `imageUrl` — a browser-usable URL under `/images/...` (see `src/web/static.ts`). The frontend
 * should render `imageUrl` and never the absolute `imagePath`.
 */
import type { SearchHit, PageFull, TimelineEntry, OpenLoop } from '../storage/repo.js';

export type { SearchHit, PageFull, TimelineEntry, OpenLoop };

/** Standard error envelope for every non-2xx response. */
export interface ApiError {
  error: string;
}

/** GET /api/overview */
export interface OverviewCounts {
  notebooks: number;
  pages: number;
  openLoops: number;
  entities: number;
}
export interface RecentPage {
  id: string;
  notebookId: string;
  notebookName: string;
  pageNumber: number;
  writtenAt: string | null;
  pageType: string | null;
  openLoop: boolean;
  /** Browser URL under /images, or null if the page has no scanned image. */
  imageUrl: string | null;
}
export interface Overview {
  counts: OverviewCounts;
  recentOpenLoops: OpenLoop[];
  recentPages: RecentPage[];
}

/** GET /api/notebooks — one entry per (non-hidden) notebook. */
export interface NotebookSummary {
  id: string;
  name: string;
  excluded: boolean;
  pageCount: number;
  /** Subfolder within the Brain folder ('' when directly inside it), for folder grouping. */
  folderPath: string;
}

/** GET /api/notebooks/:id — notebook meta + its pages as a thumbnail list. */
export interface NotebookPage {
  id: string;
  pageNumber: number;
  writtenAt: string | null;
  pageType: string | null;
  openLoop: boolean;
  imageUrl: string | null;
}
export interface NotebookDetail {
  id: string;
  name: string;
  pageCount: number;
  pages: NotebookPage[];
}

/** GET /api/pages/:id — the full page (repo `PageFull`) plus a browser image URL. */
export interface PageDetail extends PageFull {
  imageUrl: string | null;
}

/** GET /api/entities */
export interface EntitySummary {
  name: string;
  type: string;
  pageCount: number;
}

/** GET /api/search — the active SearchProvider's hits. Alias for the repo `SearchHit`. */
export type SearchResult = SearchHit;
