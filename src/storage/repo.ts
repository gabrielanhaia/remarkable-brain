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

export class Repo {
  constructor(private db: DB) {}

  upsertNotebook(n: { id: string; name: string; excluded?: boolean }): void {
    this.db
      .prepare(
        // Preserve the existing `excluded` flag on conflict: a routine sync must
        // never silently un-exclude a notebook the user excluded on purpose.
        `INSERT INTO notebooks (id, name, excluded) VALUES (@id, @name, @excluded)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name`
      )
      .run({ id: n.id, name: n.name, excluded: n.excluded ? 1 : 0 });
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
    const link = this.db.prepare(
      'INSERT INTO page_entities (page_id, entity_id) VALUES (?, ?) ON CONFLICT DO NOTHING'
    );
    const tx = this.db.transaction((es: { name: string; type: string }[]) => {
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

  searchNotes(query: string, limit = 20): SearchHit[] {
    const match = toFtsQuery(query);
    if (!match) return [];
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
      .all(match, limit) as SearchHit[];
  }

  getPage(pageId: string): PageFull | undefined {
    const row = this.db
      .prepare(
        `SELECT p.*, n.name AS notebookName FROM pages p JOIN notebooks n ON n.id = p.notebook_id WHERE p.id = ?`
      )
      .get(pageId) as any;
    if (!row) return undefined;
    const entities = this.db
      .prepare(
        `SELECT e.name, e.type FROM page_entities pe JOIN entities e ON e.id = pe.entity_id WHERE pe.page_id = ?`
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

  listNotebooks(): { id: string; name: string; excluded: boolean; pageCount: number }[] {
    return (
      this.db
        .prepare(
          `SELECT n.id, n.name, n.excluded, COUNT(p.id) AS pageCount
           FROM notebooks n LEFT JOIN pages p ON p.notebook_id = n.id
           GROUP BY n.id ORDER BY n.name`
        )
        .all() as any[]
    ).map((r) => ({ id: r.id, name: r.name, excluded: !!r.excluded, pageCount: r.pageCount }));
  }

  getEntityTimeline(entityName: string): TimelineEntry[] {
    return this.db
      .prepare(
        `SELECT p.id AS pageId, n.name AS notebookName, p.page_number AS pageNumber,
                p.written_at AS writtenAt, substr(p.extracted_text,1,160) AS snippet
         FROM page_entities pe
         JOIN entities e ON e.id = pe.entity_id
         JOIN pages p ON p.id = pe.page_id
         JOIN notebooks n ON n.id = p.notebook_id
         WHERE e.name = ? COLLATE NOCASE AND n.excluded = 0
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
    return this.db
      .prepare(
        `SELECT e.name, e.type, COUNT(pe.page_id) AS pageCount
         FROM entities e JOIN page_entities pe ON pe.entity_id = e.id
         GROUP BY e.id ORDER BY pageCount DESC, e.name`
      )
      .all() as any[];
  }

  purgeNotebook(notebookId: string): string[] {
    const imgs = (
      this.db
        .prepare('SELECT image_path FROM pages WHERE notebook_id = ? AND image_path IS NOT NULL')
        .all(notebookId) as any[]
    ).map((r) => r.image_path as string);
    this.db.prepare('DELETE FROM notebooks WHERE id = ?').run(notebookId); // cascades pages/page_entities
    return imgs;
  }

  purgeAll(): void {
    this.db.exec('DELETE FROM notebooks; DELETE FROM entities;');
  }
}
