import type { Repo, SearchHit } from '../../storage/repo.js';

/**
 * Optional narrowing applied on top of a raw query. All fields are optional; an absent field
 * means "no constraint". `notebook` matches a notebook name (as returned in {@link SearchHit}).
 */
export interface SearchFilters {
  /** Restrict to a single notebook by its display name. */
  notebook?: string;
  /** Restrict to a page type (e.g. "note", "todo", "diagram"). */
  type?: string;
  /** When true, keep only hits whose page is an open loop. */
  openLoop?: boolean;
}

/**
 * The search seam. The API and the SPA depend ONLY on this interface, never on a concrete
 * implementation, so the ranking strategy can change without touching either layer.
 */
export interface SearchProvider {
  search(query: string, filters?: SearchFilters): SearchHit[];
}

/**
 * v1 provider: full-text keyword search over `pages_fts`, via `repo.searchNotes`.
 *
 * Filters are applied AFTER the FTS query. `searchNotes` already returns notebook name, page
 * number, date and a highlighted snippet; the type/open-loop filters need per-page metadata not
 * present on `SearchHit`, so they are resolved through `repo.getPage(hit.pageId)`. This keeps all
 * SQL inside the Repo (no duplicated data logic here) at the cost of N lookups on a filtered
 * search — fine for a local, single-user index. If that ever gets hot, add a single filtered
 * query to the Repo and call it here.
 */
export class FtsSearchProvider implements SearchProvider {
  constructor(private readonly repo: Repo) {}

  search(query: string, filters?: SearchFilters): SearchHit[] {
    const q = query.trim();
    if (!q) return [];
    // Over-fetch when filtering so post-filtering still yields a full-looking result set.
    const hasFilters = !!(filters?.notebook || filters?.type || filters?.openLoop);
    const hits = this.repo.searchNotes(q, hasFilters ? 100 : 20);
    if (!hasFilters) return hits;

    return hits.filter((hit) => {
      if (filters?.notebook && hit.notebookName !== filters.notebook) return false;
      if (filters?.type || filters?.openLoop) {
        const page = this.repo.getPage(hit.pageId);
        if (!page) return false;
        if (filters.type && page.pageType !== filters.type) return false;
        if (filters.openLoop && !page.openLoop) return false;
      }
      return true;
    });
  }
}

/*
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * FUTURE: SemanticSearchProvider (designed-for, NOT implemented in v1)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * A drop-in `SearchProvider` backed by local vector embeddings. Sketch of the intended shape:
 *
 *   export class SemanticSearchProvider implements SearchProvider {
 *     constructor(private repo: Repo, private embedder: Embedder, private db: DB) {}
 *     search(query, filters?) {
 *       // 1. Embed the query locally (no network) → vector.
 *       // 2. ANN lookup over a `sqlite-vec` virtual table of per-page embeddings.
 *       // 3. HYBRID rank: blend the vector distance with the FTS BM25 `rank` from
 *       //    repo.searchNotes (reciprocal-rank fusion) so keyword-exact hits still win.
 *       // 4. Map results into SearchHit[] and apply the SAME SearchFilters as FTS.
 *     }
 *   }
 *
 * Adoption requires NO change to the API endpoint or the SPA — only the provider selected in
 * `buildApi` (later gated by config/env, e.g. RM_BRAIN_SEARCH=semantic). Embeddings would be
 * produced during `rm-brain sync` and stored alongside pages; nothing leaves the machine.
 */
