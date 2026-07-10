/**
 * Frontend mirror of the server API contract (`src/web/types.ts`). Kept self-contained (no imports
 * from the CLI package) but MUST stay identical in shape. When the server types change, update
 * both files together.
 *
 * Image note: render `imageUrl` (a `/images/...` URL). The absolute `imagePath` on `PageFull` is a
 * server-side disk path and is not directly loadable in the browser.
 */

// ── Types mirrored from src/storage/repo.ts ────────────────────────────────────────────────────

export interface SearchHit {
  pageId: string;
  notebookName: string;
  pageNumber: number;
  writtenAt: string | null;
  snippet: string;
}

export interface PageFull {
  id: string;
  notebookId: string;
  notebookName: string;
  pageNumber: number;
  writtenAt: string | null;
  imagePath: string | null;
  extractedText: string | null;
  pageType: string | null;
  openLoop: boolean;
  openLoopDescription: string | null;
  contentHash: string | null;
  extractedAt: string | null;
  entities: { name: string; type: string }[];
}

export interface TimelineEntry {
  pageId: string;
  notebookName: string;
  pageNumber: number;
  writtenAt: string | null;
  snippet: string;
}

export interface OpenLoop {
  pageId: string;
  notebookName: string;
  pageNumber: number;
  writtenAt: string | null;
  description: string | null;
}

// ── Types mirrored from src/web/types.ts ───────────────────────────────────────────────────────

export interface ApiError {
  error: string;
}

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
  imageUrl: string | null;
}
export interface Overview {
  counts: OverviewCounts;
  recentOpenLoops: OpenLoop[];
  recentPages: RecentPage[];
}

export interface NotebookSummary {
  id: string;
  name: string;
  excluded: boolean;
  pageCount: number;
  /** Subfolder within the Brain folder ('' when directly inside it), for folder grouping. */
  folderPath: string;
}

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

export interface PageDetail extends PageFull {
  imageUrl: string | null;
}

export interface EntitySummary {
  name: string;
  type: string;
  pageCount: number;
}

export type SearchResult = SearchHit;

/** Filters accepted by GET /api/search. */
export interface SearchFilters {
  notebook?: string;
  type?: string;
  openLoop?: boolean;
}
