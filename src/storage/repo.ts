import type { DB } from './db.js';

/**
 * Turn arbitrary user text into a safe FTS5 MATCH expression. FTS5 treats characters like
 * `/ " : * ( ) -` as operators, so raw queries (e.g. "08/07") throw a syntax error. We extract
 * word/number tokens and quote each one, giving implicit-AND matching with no injection risk.
 */
export function toFtsQuery(raw: string): string {
  const tokens = raw.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((t) => `"${t}"`).join(' ');
}

/** Split arbitrary text into lowercase word/number tokens (same rule the FTS query uses). */
export function queryTokens(raw: string): string[] {
  return (raw.match(/[\p{L}\p{N}]+/gu) ?? []).map((t) => t.toLowerCase());
}

/**
 * Levenshtein edit distance, bounded for early exit. Used to match a mistyped query token against
 * indexed vocabulary terms — small inputs (single words), so the O(n·m) table is negligible.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

export interface PageRecord {
  id: string;
  notebookId: string;
  pageNumber: number;
  writtenAt?: string | null;
  imagePath?: string | null;
  extractedText?: string | null;
  pageType?: string | null;
  openLoop?: boolean;
  openLoopDescription?: string | null;
  contentHash?: string | null;
  extractedAt?: string | null;
}
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
/** A page row as listed inside a single notebook (thumbnail grid). */
export interface NotebookPageRow {
  id: string;
  pageNumber: number;
  writtenAt: string | null;
  pageType: string | null;
  openLoop: boolean;
  imagePath: string | null;
}
/** A recently-written page across all (non-excluded) notebooks, for the overview. */
export interface RecentPageRow {
  id: string;
  notebookId: string;
  notebookName: string;
  pageNumber: number;
  writtenAt: string | null;
  pageType: string | null;
  openLoop: boolean;
  imagePath: string | null;
}

export class Repo {
  constructor(private db: DB) {}

  upsertNotebook(n: { id: string; name: string; excluded?: boolean; folderPath?: string }): void {
    this.db
      .prepare(
        // Preserve the existing `excluded` flag on conflict: a routine sync must never silently
        // un-exclude a notebook the user excluded on purpose. name/folder_path do track the
        // device (a renamed or moved notebook updates both).
        `INSERT INTO notebooks (id, name, excluded, folder_path)
         VALUES (@id, @name, @excluded, @folderPath)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, folder_path = excluded.folder_path`
      )
      .run({ id: n.id, name: n.name, excluded: n.excluded ? 1 : 0, folderPath: n.folderPath ?? '' });
  }

  setExcluded(notebookId: string, excluded: boolean): void {
    this.db.prepare('UPDATE notebooks SET excluded = ? WHERE id = ?').run(excluded ? 1 : 0, notebookId);
  }

  listExcludedIds(): string[] {
    return (this.db.prepare('SELECT id FROM notebooks WHERE excluded = 1').all() as { id: string }[]).map(
      (r) => r.id
    );
  }

  upsertPage(p: PageRecord): void {
    this.db
      .prepare(
        `INSERT INTO pages (id, notebook_id, page_number, written_at, image_path, extracted_text,
            page_type, open_loop, open_loop_description, content_hash, extracted_at)
         VALUES (@id, @notebookId, @pageNumber, @writtenAt, @imagePath, @extractedText,
            @pageType, @openLoop, @openLoopDescription, @contentHash, @extractedAt)
         ON CONFLICT(id) DO UPDATE SET
            page_number=excluded.page_number, written_at=excluded.written_at, image_path=excluded.image_path,
            extracted_text=excluded.extracted_text, page_type=excluded.page_type, open_loop=excluded.open_loop,
            open_loop_description=excluded.open_loop_description, content_hash=excluded.content_hash,
            extracted_at=excluded.extracted_at`
      )
      .run({
        id: p.id,
        notebookId: p.notebookId,
        pageNumber: p.pageNumber,
        writtenAt: p.writtenAt ?? null,
        imagePath: p.imagePath ?? null,
        extractedText: p.extractedText ?? null,
        pageType: p.pageType ?? null,
        openLoop: p.openLoop ? 1 : 0,
        openLoopDescription: p.openLoopDescription ?? null,
        contentHash: p.contentHash ?? null,
        extractedAt: p.extractedAt ?? null,
      });
  }

  linkEntities(pageId: string, entities: { name: string; type: string }[]): void {
    const insEntity = this.db.prepare(
      'INSERT INTO entities (name, type) VALUES (?, ?) ON CONFLICT(name, type) DO NOTHING'
    );
    const getId = this.db.prepare('SELECT id FROM entities WHERE name = ? AND type = ?');
    const clear = this.db.prepare('DELETE FROM page_entities WHERE page_id = ?');
    const link = this.db.prepare(
      'INSERT INTO page_entities (page_id, entity_id) VALUES (?, ?) ON CONFLICT DO NOTHING'
    );
    const tx = this.db.transaction((es: { name: string; type: string }[]) => {
      // Re-indexing a page must REPLACE its links, not accumulate them: clear first so an entity
      // dropped from a fresh extraction stops appearing on this page (and in its timeline).
      clear.run(pageId);
      for (const e of es) {
        const name = e.name.trim();
        if (!name) continue;
        insEntity.run(name, e.type);
        const row = getId.get(name, e.type) as { id: number };
        link.run(pageId, row.id);
      }
    });
    tx(entities);
  }

  /**
   * Delete pages of a notebook whose page_number is not in `keep` — i.e. pages removed inside the
   * notebook since the last render. Returns their image paths so the caller can unlink the files.
   * An empty `keep` deletes every page of the notebook, so callers MUST guard against an empty
   * render (a failed render must never be mistaken for "the notebook now has no pages").
   */
  prunePagesNotIn(notebookId: string, keep: number[]): string[] {
    const notIn = keep.length ? `AND page_number NOT IN (${keep.map(() => '?').join(',')})` : '';
    const where = `notebook_id = ? ${notIn}`;
    const params = [notebookId, ...keep];
    const imgs = (
      this.db
        .prepare(`SELECT image_path FROM pages WHERE ${where} AND image_path IS NOT NULL`)
        .all(...params) as { image_path: string }[]
    ).map((r) => r.image_path);
    this.db.prepare(`DELETE FROM pages WHERE ${where}`).run(...params);
    return imgs;
  }

  /**
   * Keyword search with graceful widening so partial words and typos still find pages:
   *   1. prefix-AND — every token as a prefix (`"meet"*` finds "meeting", stems match);
   *   2. fuzzy fallback — only if step 1 finds nothing, each token is expanded to the indexed
   *      vocabulary terms within a small edit distance (so "meetign" still finds "meeting").
   */
  searchNotes(query: string, limit = 20): SearchHit[] {
    const tokens = queryTokens(query);
    if (tokens.length === 0) return [];

    const prefix = tokens.map((t) => `"${t}"*`).join(' ');
    const primary = this.runFtsMatch(prefix, limit);
    if (primary.length > 0) return primary;

    const groups = tokens.map((t) => this.fuzzyExpand(t));
    if (groups.some((g) => g.length === 0)) return [];
    const fuzzy = groups.map((g) => `(${g.map((term) => `"${term}"*`).join(' OR ')})`).join(' ');
    return this.runFtsMatch(fuzzy, limit);
  }

  /** Run one FTS5 MATCH expression. A malformed expression yields no rows rather than throwing. */
  private runFtsMatch(matchExpr: string, limit: number): SearchHit[] {
    if (!matchExpr) return [];
    try {
      return this.db
        .prepare(
          `SELECT p.id AS pageId, n.name AS notebookName, p.page_number AS pageNumber,
                  p.written_at AS writtenAt,
                  snippet(pages_fts, 0, '[', ']', '…', 12) AS snippet
           FROM pages_fts
           JOIN pages p ON p.rowid = pages_fts.rowid
           JOIN notebooks n ON n.id = p.notebook_id
           WHERE pages_fts MATCH ? AND n.excluded = 0
           ORDER BY rank LIMIT ?`
        )
        .all(matchExpr, limit) as SearchHit[];
    } catch {
      return [];
    }
  }

  /** Vocabulary terms within a small edit distance of `token` (plus the token itself as a seed). */
  private fuzzyExpand(token: string): string[] {
    const L = token.length;
    const maxDist = L <= 3 ? 0 : L <= 5 ? 1 : 2;
    if (maxDist === 0) return [token]; // too short to fuzz safely — rely on the prefix match
    let terms: { term: string }[] = [];
    try {
      terms = this.db
        .prepare(`SELECT term FROM pages_vocab WHERE length(term) BETWEEN ? AND ?`)
        .all(L - maxDist, L + maxDist) as { term: string }[];
    } catch {
      return [token];
    }
    const near = terms
      .map((r) => r.term)
      .filter((term) => levenshtein(token, term.toLowerCase()) <= maxDist);
    if (!near.includes(token)) near.push(token);
    return near.slice(0, 8);
  }

  getPage(pageId: string): PageFull | undefined {
    interface PageRow {
      id: string;
      notebook_id: string;
      notebookName: string;
      page_number: number;
      written_at: string | null;
      image_path: string | null;
      extracted_text: string | null;
      page_type: string | null;
      open_loop: number;
      open_loop_description: string | null;
      content_hash: string | null;
      extracted_at: string | null;
    }
    const row = this.db
      .prepare(
        `SELECT p.*, n.name AS notebookName FROM pages p JOIN notebooks n ON n.id = p.notebook_id WHERE p.id = ?`
      )
      .get(pageId) as PageRow | undefined;
    if (!row) return undefined;
    const entities = this.db
      .prepare(
        // De-duplicate by name (case-insensitive): a page that linked the same real entity under
        // two synonymous types must not render it twice. `type` is the name's most-mentioned
        // variant, matching how listEntities picks it — so the glyph is consistent everywhere.
        `SELECT e.name AS name,
                (SELECT e2.type FROM entities e2
                   JOIN page_entities pe2 ON pe2.entity_id = e2.id
                  WHERE e2.name = e.name COLLATE NOCASE
                  GROUP BY e2.id ORDER BY COUNT(pe2.page_id) DESC, e2.type ASC LIMIT 1) AS type
         FROM page_entities pe JOIN entities e ON e.id = pe.entity_id
         WHERE pe.page_id = ?
         GROUP BY e.name COLLATE NOCASE
         ORDER BY e.name`
      )
      .all(pageId) as { name: string; type: string }[];
    return {
      id: row.id,
      notebookId: row.notebook_id,
      notebookName: row.notebookName,
      pageNumber: row.page_number,
      writtenAt: row.written_at,
      imagePath: row.image_path,
      extractedText: row.extracted_text,
      pageType: row.page_type,
      openLoop: !!row.open_loop,
      openLoopDescription: row.open_loop_description,
      contentHash: row.content_hash,
      extractedAt: row.extracted_at,
      entities,
    };
  }

  listNotebooks(): {
    id: string;
    name: string;
    excluded: boolean;
    pageCount: number;
    folderPath: string;
  }[] {
    return (
      this.db
        .prepare(
          `SELECT n.id, n.name, n.excluded, n.folder_path AS folderPath, COUNT(p.id) AS pageCount
           FROM notebooks n LEFT JOIN pages p ON p.notebook_id = n.id
           GROUP BY n.id ORDER BY n.folder_path, n.name`
        )
        .all() as {
        id: string;
        name: string;
        excluded: number;
        pageCount: number;
        folderPath: string;
      }[]
    ).map((r) => ({
      id: r.id,
      name: r.name,
      excluded: !!r.excluded,
      pageCount: r.pageCount,
      folderPath: r.folderPath,
    }));
  }

  /** Pages of one notebook, ordered by page number — for the notebook-detail thumbnail grid. */
  listNotebookPages(notebookId: string): NotebookPageRow[] {
    return (
      this.db
        .prepare(
          `SELECT id, page_number AS pageNumber, written_at AS writtenAt, page_type AS pageType,
                  open_loop AS openLoop, image_path AS imagePath
           FROM pages WHERE notebook_id = ? ORDER BY page_number ASC`
        )
        .all(notebookId) as (Omit<NotebookPageRow, 'openLoop'> & { openLoop: number })[]
    ).map((r) => ({ ...r, openLoop: !!r.openLoop }));
  }

  /** Most recently-written pages across all non-excluded notebooks — for the overview. */
  recentPages(limit = 12): RecentPageRow[] {
    return (
      this.db
        .prepare(
          `SELECT p.id, p.notebook_id AS notebookId, n.name AS notebookName, p.page_number AS pageNumber,
                  p.written_at AS writtenAt, p.page_type AS pageType, p.open_loop AS openLoop,
                  p.image_path AS imagePath
           FROM pages p JOIN notebooks n ON n.id = p.notebook_id
           WHERE n.excluded = 0
           ORDER BY p.written_at DESC, p.page_number DESC LIMIT ?`
        )
        .all(limit) as (Omit<RecentPageRow, 'openLoop'> & { openLoop: number })[]
    ).map((r) => ({ ...r, openLoop: !!r.openLoop }));
  }

  getEntityTimeline(entityName: string): TimelineEntry[] {
    return this.db
      .prepare(
        // GROUP BY the page: a name that exists as several type-variants (e.g. topic + item) links
        // the same page more than once, and without this the page would appear twice in its timeline.
        `SELECT p.id AS pageId, n.name AS notebookName, p.page_number AS pageNumber,
                p.written_at AS writtenAt, substr(p.extracted_text,1,160) AS snippet
         FROM page_entities pe
         JOIN entities e ON e.id = pe.entity_id
         JOIN pages p ON p.id = pe.page_id
         JOIN notebooks n ON n.id = p.notebook_id
         WHERE e.name = ? COLLATE NOCASE AND n.excluded = 0
         GROUP BY p.id
         ORDER BY p.written_at ASC, p.page_number ASC`
      )
      .all(entityName) as TimelineEntry[];
  }

  getOpenLoops(limit = 50): OpenLoop[] {
    return this.db
      .prepare(
        `SELECT p.id AS pageId, n.name AS notebookName, p.page_number AS pageNumber,
                p.written_at AS writtenAt, p.open_loop_description AS description
         FROM pages p JOIN notebooks n ON n.id = p.notebook_id
         WHERE p.open_loop = 1 AND n.excluded = 0
         ORDER BY p.written_at DESC, p.page_number DESC LIMIT ?`
      )
      .all(limit) as OpenLoop[];
  }

  listEntities(): { name: string; type: string; pageCount: number }[] {
    // Group by NAME (case-insensitive), not by (name,type): the timeline already treats an entity
    // as its name, so the same real thing tagged with different types must collapse into one card.
    // `type` is the type of that name's most-mentioned variant; pageCount is DISTINCT pages.
    return this.db
      .prepare(
        `SELECT e.name AS name,
                (SELECT e2.type FROM entities e2
                   JOIN page_entities pe2 ON pe2.entity_id = e2.id
                  WHERE e2.name = e.name COLLATE NOCASE
                  GROUP BY e2.id
                  ORDER BY COUNT(pe2.page_id) DESC, e2.type ASC
                  LIMIT 1) AS type,
                COUNT(DISTINCT pe.page_id) AS pageCount
         FROM entities e JOIN page_entities pe ON pe.entity_id = e.id
         GROUP BY e.name COLLATE NOCASE
         ORDER BY pageCount DESC, e.name`
      )
      .all() as { name: string; type: string; pageCount: number }[];
  }

  purgeNotebook(notebookId: string): string[] {
    const imgs = (
      this.db
        .prepare('SELECT image_path FROM pages WHERE notebook_id = ? AND image_path IS NOT NULL')
        .all(notebookId) as { image_path: string }[]
    ).map((r) => r.image_path);
    this.db.prepare('DELETE FROM notebooks WHERE id = ?').run(notebookId); // cascades pages/page_entities
    return imgs;
  }

  purgeAll(): void {
    this.db.exec('DELETE FROM notebooks; DELETE FROM entities;');
  }
}
