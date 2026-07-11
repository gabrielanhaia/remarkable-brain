import type { Config } from '../../config.js';
import type { Repo, SearchHit } from '../../storage/repo.js';
import { cosine, createEmbedder, type Embedder } from '../../search/embedder.js';

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
 * implementation, so the ranking strategy can change without touching either layer. `search` is
 * async so a provider may embed the query on-device (still no network) before ranking.
 */
export interface SearchProvider {
  search(query: string, filters?: SearchFilters): Promise<SearchHit[]>;
}

/**
 * v1 provider: full-text keyword search over `pages_fts` (stemmed + prefix + fuzzy), via
 * `repo.searchNotes`. Filters are applied AFTER the FTS query through per-page metadata.
 */
export class FtsSearchProvider implements SearchProvider {
  constructor(private readonly repo: Repo) {}

  async search(query: string, filters?: SearchFilters): Promise<SearchHit[]> {
    const q = query.trim();
    if (!q) return [];
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

const HYBRID_LIMIT = 30;
const RRF_K = 60; // reciprocal-rank-fusion damping; higher = flatter contribution from deep ranks

/**
 * Hybrid provider: blends keyword search with local semantic (vector) search. The query is embedded
 * ON-DEVICE (no network) and compared by cosine similarity against per-page embeddings; the two
 * ranked lists are fused with Reciprocal Rank Fusion so exact keyword hits and meaning-based hits
 * both surface. Semantic ranking is best-effort — if embedding fails, keyword results still return.
 */
export class HybridSearchProvider implements SearchProvider {
  constructor(
    private readonly repo: Repo,
    private readonly embedder: Embedder,
    private readonly keyword: SearchProvider
  ) {}

  async search(query: string, filters?: SearchFilters): Promise<SearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    const hasFilters = !!(filters?.notebook || filters?.type || filters?.openLoop);

    const keywordHits = await this.keyword.search(q, filters);

    let semanticIds: string[] = [];
    try {
      const [qv] = await this.embedder.embed([q]);
      if (qv) {
        semanticIds = this.repo
          .allEmbeddings()
          .map((e) => ({ pageId: e.pageId, score: cosine(qv, e.vec) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 50)
          .map((s) => s.pageId);
        if (hasFilters) semanticIds = semanticIds.filter((id) => this.passesFilters(id, filters!));
      }
    } catch {
      // Semantic pass is best-effort; a missing/failed model must never break search.
    }
    if (semanticIds.length === 0) return keywordHits;

    // Reciprocal Rank Fusion of the two ranked lists.
    const fused = new Map<string, number>();
    keywordHits.forEach((h, i) => fused.set(h.pageId, (fused.get(h.pageId) ?? 0) + 1 / (RRF_K + i + 1)));
    semanticIds.forEach((id, i) => fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + i + 1)));
    const ordered = [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, HYBRID_LIMIT)
      .map(([id]) => id);

    // Hydrate: reuse keyword SearchHits (good highlighted snippets) where available.
    const byId = new Map(keywordHits.map((h) => [h.pageId, h]));
    const needed = ordered.filter((id) => !byId.has(id));
    for (const h of this.repo.pageHits(needed)) byId.set(h.pageId, h);
    return ordered.map((id) => byId.get(id)).filter((h): h is SearchHit => !!h);
  }

  private passesFilters(pageId: string, filters: SearchFilters): boolean {
    const page = this.repo.getPage(pageId);
    if (!page) return false;
    if (filters.notebook && page.notebookName !== filters.notebook) return false;
    if (filters.type && page.pageType !== filters.type) return false;
    if (filters.openLoop && !page.openLoop) return false;
    return true;
  }
}

/**
 * Pick the active search provider. Uses hybrid keyword+semantic search when the config allows it
 * (`searchMode !== 'keyword'`), embeddings exist, AND the optional embedding dependency is
 * installed; otherwise falls back to plain keyword search. Never throws.
 */
export async function resolveSearchProvider(repo: Repo, cfg: Config): Promise<SearchProvider> {
  const keyword = new FtsSearchProvider(repo);
  if (cfg.searchMode === 'keyword') return keyword;
  if (!repo.hasEmbeddings()) return keyword;
  const embedder = await createEmbedder(cfg.embedModel);
  if (!embedder) return keyword;
  return new HybridSearchProvider(repo, embedder, keyword);
}
