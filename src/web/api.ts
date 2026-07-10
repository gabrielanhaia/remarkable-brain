import type { Config } from '../config.js';
import type { Repo } from '../storage/repo.js';
import { FtsSearchProvider, type SearchProvider, type SearchFilters } from './search/provider.js';
import { imageUrlFromPath } from './static.js';
import type {
  ApiError,
  EntitySummary,
  NotebookDetail,
  NotebookSummary,
  Overview,
  PageDetail,
  RecentPage,
  SearchResult,
} from './types.js';

/** What a route handler receives: matched path params + parsed query string. */
export interface ApiRequest {
  params: Record<string, string>;
  query: URLSearchParams;
}

/** What a route handler returns: an HTTP status and a JSON-serializable body. */
export interface ApiResponse {
  status: number;
  body: unknown;
}

export type ApiHandler = (req: ApiRequest) => ApiResponse;

/** A GET route: a path pattern with `:param` segments and its handler. */
export interface ApiRoute {
  method: 'GET';
  /** e.g. `/api/notebooks/:id`. Matched by the server's router. */
  pattern: string;
  handler: ApiHandler;
}

function ok(body: unknown): ApiResponse {
  return { status: 200, body };
}
function err(status: number, message: string): ApiResponse {
  const body: ApiError = { error: message };
  return { status, body };
}

/** Friendly empty/missing-index response. Every endpoint short-circuits to this when no pages. */
function emptyIndex(): ApiResponse {
  return err(503, 'No notes indexed yet — run `rm-brain sync` first.');
}

/**
 * Build the read-only web API: a set of pure route handlers over the existing `Repo`. Handlers
 * take `{ params, query }` and return `{ status, body }` — no `http` types leak in, so they are
 * trivially unit-testable (mirrors the MCP tools tests). The server wires these to GET requests.
 */
export function buildApi(
  repo: Repo,
  config: Config,
  search: SearchProvider = new FtsSearchProvider(repo)
): ApiRoute[] {
  const imagesDir = config.imagesDir;

  /** True once at least one page is indexed. Drives the friendly 503 empty-DB state. */
  const hasPages = (): boolean => repo.listNotebooks().some((n) => n.pageCount > 0);

  const overview: ApiHandler = () => {
    if (!hasPages()) return emptyIndex();
    const notebooks = repo.listNotebooks();
    const pages = notebooks.reduce((s, n) => s + n.pageCount, 0);
    const openLoops = repo.getOpenLoops(1000);
    const entities = repo.listEntities();
    const recentPages: RecentPage[] = repo.recentPages(12).map((p) => ({
      id: p.id,
      notebookId: p.notebookId,
      notebookName: p.notebookName,
      pageNumber: p.pageNumber,
      writtenAt: p.writtenAt,
      pageType: p.pageType,
      openLoop: p.openLoop,
      imageUrl: imageUrlFromPath(p.imagePath, imagesDir),
    }));
    const body: Overview = {
      counts: {
        notebooks: notebooks.filter((n) => !n.excluded).length,
        pages,
        openLoops: openLoops.length,
        entities: entities.length,
      },
      recentOpenLoops: openLoops.slice(0, 8),
      recentPages,
    };
    return ok(body);
  };

  const notebooks: ApiHandler = () => {
    if (!hasPages()) return emptyIndex();
    const body: NotebookSummary[] = repo.listNotebooks().filter((n) => !n.excluded);
    return ok(body);
  };

  const notebookDetail: ApiHandler = (req) => {
    if (!hasPages()) return emptyIndex();
    const id = req.params.id;
    if (!id) return err(400, 'Missing notebook id');
    const meta = repo.listNotebooks().find((n) => n.id === id && !n.excluded);
    if (!meta) return err(404, 'Notebook not found');
    const body: NotebookDetail = {
      id: meta.id,
      name: meta.name,
      pageCount: meta.pageCount,
      pages: repo.listNotebookPages(id).map((p) => ({
        id: p.id,
        pageNumber: p.pageNumber,
        writtenAt: p.writtenAt,
        pageType: p.pageType,
        openLoop: p.openLoop,
        imageUrl: imageUrlFromPath(p.imagePath, imagesDir),
      })),
    };
    return ok(body);
  };

  const pageDetail: ApiHandler = (req) => {
    if (!hasPages()) return emptyIndex();
    const id = req.params.id;
    if (!id) return err(400, 'Missing page id');
    const page = repo.getPage(id);
    if (!page) return err(404, 'Page not found');
    const body: PageDetail = { ...page, imageUrl: imageUrlFromPath(page.imagePath, imagesDir) };
    return ok(body);
  };

  const searchHandler: ApiHandler = (req) => {
    if (!hasPages()) return emptyIndex();
    const q = req.query.get('q')?.trim() ?? '';
    if (!q) return ok([] as SearchResult[]);
    const filters: SearchFilters = {};
    const notebook = req.query.get('notebook');
    const type = req.query.get('type');
    const openLoop = req.query.get('open_loop');
    if (notebook) filters.notebook = notebook;
    if (type) filters.type = type;
    if (openLoop === '1' || openLoop === 'true') filters.openLoop = true;
    const body: SearchResult[] = search.search(q, filters);
    return ok(body);
  };

  const openLoops: ApiHandler = (req) => {
    if (!hasPages()) return emptyIndex();
    const raw = req.query.get('limit');
    let limit = 50;
    if (raw !== null) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return err(400, 'Invalid limit');
      limit = Math.min(Math.floor(n), 1000);
    }
    return ok(repo.getOpenLoops(limit));
  };

  const entities: ApiHandler = () => {
    if (!hasPages()) return emptyIndex();
    const body: EntitySummary[] = repo.listEntities();
    return ok(body);
  };

  const entityTimeline: ApiHandler = (req) => {
    if (!hasPages()) return emptyIndex();
    const name = req.params.name;
    if (!name) return err(400, 'Missing entity name');
    return ok(repo.getEntityTimeline(name));
  };

  return [
    { method: 'GET', pattern: '/api/overview', handler: overview },
    { method: 'GET', pattern: '/api/notebooks', handler: notebooks },
    { method: 'GET', pattern: '/api/notebooks/:id', handler: notebookDetail },
    { method: 'GET', pattern: '/api/pages/:id', handler: pageDetail },
    { method: 'GET', pattern: '/api/search', handler: searchHandler },
    { method: 'GET', pattern: '/api/open-loops', handler: openLoops },
    { method: 'GET', pattern: '/api/entities', handler: entities },
    { method: 'GET', pattern: '/api/entities/:name/timeline', handler: entityTimeline },
  ];
}
