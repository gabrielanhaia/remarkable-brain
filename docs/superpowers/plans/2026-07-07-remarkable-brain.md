# reMarkable Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-first CLI + MCP server that syncs `#brain`-tagged reMarkable notebooks, transcribes/classifies them via the Claude API, stores them in local SQLite (FTS5), and answers natural-language queries through Claude Desktop.

**Architecture:** reMarkable Cloud → rmapi (list/tags/export PDF) → poppler (PDF→PNG) → extraction module (Claude vision, one forced-tool call per page) → SQLite+FTS5 → MCP server → Claude Desktop. The extraction module is the only automatic external caller. Admin happens through a `@clack/prompts` CLI.

**Tech Stack:** Node 20+, TypeScript, better-sqlite3 (FTS5), @anthropic-ai/sdk, zod, @modelcontextprotocol/sdk, @clack/prompts, picocolors, cli-table3, vitest, tsx/tsup.

## Global Constraints

- **Local-first:** DB, images, manifest live under `RM_BRAIN_HOME` (default `~/.rm-brain`). Only page PNGs (extraction) and queries+snippets (MCP) go over the network.
- **Opt-in inclusion:** ONLY documents tagged `#brain` are synced/extracted. Nothing else leaves the device.
- **Hard exclusion always wins:** a document whose name matches `/^\./`, `/private/i`, or `/noindex/i` is skipped even if tagged `#brain`. Checked before any download.
- **Extraction isolation:** `src/extraction/**` is the ONLY code that calls an external API automatically, and the only holder of `ANTHROPIC_API_KEY`.
- **No secrets committed:** config via env only (`RM_BRAIN_HOME`, `RMAPI_BIN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` default `claude-sonnet-5`). `.env` and data dirs are gitignored.
- **Every answer shows receipts:** notebook name, page number, date on every returned page.
- **One Claude call per page** returning structured JSON — never per-field calls.
- **TDD:** every task writes a failing test first. No live API calls in tests — the Anthropic client is always injected/mocked.
- **ESM + NodeNext** module resolution; TypeScript strict mode.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `.prettierrc`, `eslint.config.js`, `src/index.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: an installable TS project with `npm test`, `npm run build`, `npm run dev` scripts; ESM/NodeNext; a `rm-brain` bin pointing at the built CLI.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "rm-brain",
  "version": "0.1.0",
  "description": "Local-first second brain for reMarkable notebooks, searched through Claude Desktop",
  "license": "MIT",
  "type": "module",
  "bin": { "rm-brain": "dist/cli.js" },
  "exports": "./dist/index.js",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsup src/cli.ts src/index.ts src/mcp/server.ts --format esm --clean --dts=false",
    "dev": "tsx src/cli.ts",
    "mcp": "tsx src/mcp/server.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.40.0",
    "@clack/prompts": "^0.9.0",
    "@modelcontextprotocol/sdk": "^1.10.0",
    "better-sqlite3": "^11.8.0",
    "cli-table3": "^0.6.5",
    "picocolors": "^1.1.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^20.17.0",
    "eslint": "^9.18.0",
    "prettier": "^3.4.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.20.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`, `.gitignore`, `.env.example`, `.prettierrc`, `eslint.config.js`**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
```

`.gitignore`:
```
node_modules/
dist/
.env
*.sqlite
.rm-brain/
coverage/
```

`.env.example`:
```
# Path to the local data home (default: ~/.rm-brain)
RM_BRAIN_HOME=
# Path/name of the rmapi binary (default: rmapi)
RMAPI_BIN=rmapi
# Required only for `rm-brain sync` (extraction). Never commit this.
ANTHROPIC_API_KEY=
# Vision model for extraction (default: claude-sonnet-5)
ANTHROPIC_MODEL=claude-sonnet-5
```

`.prettierrc`:
```json
{ "singleQuote": true, "printWidth": 100, "semi": true }
```

`eslint.config.js`:
```js
import tseslint from 'typescript-eslint';
export default tseslint.config(...tseslint.configs.recommended, {
  ignores: ['dist/', 'node_modules/'],
});
```

- [ ] **Step 4: Write `src/index.ts` and smoke test**

`src/index.ts`:
```ts
export const VERSION = '0.1.0';
```

`tests/smoke.test.ts`:
```ts
import { expect, test } from 'vitest';
import { VERSION } from '../src/index.js';

test('package exposes a version', () => {
  expect(VERSION).toBe('0.1.0');
});
```

- [ ] **Step 5: Install and run tests**

Run: `npm install && npm test`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: project scaffold (ts, vitest, eslint, prettier)"
```

---

### Task 2: Config module

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces:
  - `BRAIN_TAG = 'brain'`
  - `HARD_EXCLUDE_PATTERNS: RegExp[]`
  - `interface Config { home: string; dbPath: string; imagesDir: string; manifestPath: string; rmapiBin: string; anthropicApiKey?: string; anthropicModel: string; }`
  - `loadConfig(env?: NodeJS.ProcessEnv): Config`
  - `isHardExcluded(name: string): boolean`
  - `hasBrainTag(tags: string[]): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { loadConfig, isHardExcluded, hasBrainTag, HARD_EXCLUDE_PATTERNS } from '../src/config.js';

describe('config', () => {
  test('defaults home to ~/.rm-brain and model to sonnet-5', () => {
    const cfg = loadConfig({ HOME: '/home/x' });
    expect(cfg.home).toBe('/home/x/.rm-brain');
    expect(cfg.dbPath).toBe('/home/x/.rm-brain/db.sqlite');
    expect(cfg.imagesDir).toBe('/home/x/.rm-brain/images');
    expect(cfg.manifestPath).toBe('/home/x/.rm-brain/manifest.json');
    expect(cfg.rmapiBin).toBe('rmapi');
    expect(cfg.anthropicModel).toBe('claude-sonnet-5');
  });

  test('env overrides win', () => {
    const cfg = loadConfig({ RM_BRAIN_HOME: '/data', RMAPI_BIN: '/bin/rmapi', ANTHROPIC_MODEL: 'claude-opus-4-8', ANTHROPIC_API_KEY: 'k' });
    expect(cfg.home).toBe('/data');
    expect(cfg.rmapiBin).toBe('/bin/rmapi');
    expect(cfg.anthropicModel).toBe('claude-opus-4-8');
    expect(cfg.anthropicApiKey).toBe('k');
  });

  test('hard exclusion matches dotfiles, private, noindex (case-insensitive)', () => {
    expect(isHardExcluded('.Secret')).toBe(true);
    expect(isHardExcluded('My Private Journal')).toBe(true);
    expect(isHardExcluded('Work noindex')).toBe(true);
    expect(isHardExcluded('Work Notes')).toBe(false);
    expect(HARD_EXCLUDE_PATTERNS.length).toBe(3);
  });

  test('brain tag matches with or without leading #, case-insensitive', () => {
    expect(hasBrainTag(['brain'])).toBe(true);
    expect(hasBrainTag(['#Brain'])).toBe(true);
    expect(hasBrainTag(['todo', 'work'])).toBe(false);
    expect(hasBrainTag([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/config.ts`**

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export const BRAIN_TAG = 'brain';
export const HARD_EXCLUDE_PATTERNS: RegExp[] = [/^\./, /private/i, /noindex/i];

export interface Config {
  home: string;
  dbPath: string;
  imagesDir: string;
  manifestPath: string;
  rmapiBin: string;
  anthropicApiKey?: string;
  anthropicModel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const home = env.RM_BRAIN_HOME?.trim() || join(env.HOME || homedir(), '.rm-brain');
  return {
    home,
    dbPath: join(home, 'db.sqlite'),
    imagesDir: join(home, 'images'),
    manifestPath: join(home, 'manifest.json'),
    rmapiBin: env.RMAPI_BIN?.trim() || 'rmapi',
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5',
  };
}

export function isHardExcluded(name: string): boolean {
  return HARD_EXCLUDE_PATTERNS.some((re) => re.test(name));
}

export function hasBrainTag(tags: string[]): boolean {
  return tags.some((t) => t.replace(/^#/, '').trim().toLowerCase() === BRAIN_TAG);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: config module with opt-in/exclusion rules"
```

---

### Task 3: Storage — schema & migrations

**Files:**
- Create: `src/storage/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `openDb(path: string): Database` (from `better-sqlite3`, `Database` type re-exported)
  - `migrate(db: Database): void` — creates all tables, FTS5 table, and sync triggers. Idempotent.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/storage/db.js';

test('migrate creates tables and FTS index and is idempotent', () => {
  const db = new Database(':memory:');
  migrate(db);
  migrate(db); // idempotent
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name")
    .all()
    .map((r: any) => r.name);
  expect(tables).toContain('notebooks');
  expect(tables).toContain('pages');
  expect(tables).toContain('entities');
  expect(tables).toContain('page_entities');
  expect(tables).toContain('pages_fts');
});

test('FTS row is populated by trigger on page insert', () => {
  const db = new Database(':memory:');
  migrate(db);
  db.prepare("INSERT INTO notebooks (id, name, excluded) VALUES ('n1','Notes',0)").run();
  db.prepare(
    "INSERT INTO pages (id, notebook_id, page_number, extracted_text) VALUES ('p1','n1',1,'hello acme world')"
  ).run();
  const hit = db.prepare("SELECT rowid FROM pages_fts WHERE pages_fts MATCH 'acme'").get();
  expect(hit).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/storage/db.ts`**

```ts
import Database from 'better-sqlite3';
export type DB = Database.Database;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      excluded INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      written_at TEXT,
      image_path TEXT,
      extracted_text TEXT,
      page_type TEXT,
      open_loop INTEGER NOT NULL DEFAULT 0,
      open_loop_description TEXT,
      extracted_at TEXT,
      content_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pages_notebook ON pages(notebook_id);
    CREATE INDEX IF NOT EXISTS idx_pages_open_loop ON pages(open_loop);

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      UNIQUE(name, type)
    );

    CREATE TABLE IF NOT EXISTS page_entities (
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      PRIMARY KEY (page_id, entity_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      extracted_text,
      content='pages',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
      INSERT INTO pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
    END;
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/storage/db.ts tests/db.test.ts
git commit -m "feat: sqlite schema + FTS5 triggers"
```

---

### Task 4: Storage — repository

**Files:**
- Create: `src/storage/repo.ts`
- Test: `tests/repo.test.ts`

**Interfaces:**
- Consumes: `DB`, `migrate` from `src/storage/db.ts`.
- Produces a `Repo` class:
  - `constructor(db: DB)`
  - `upsertNotebook(n: { id: string; name: string; excluded?: boolean }): void`
  - `setExcluded(notebookId: string, excluded: boolean): void`
  - `upsertPage(p: PageRecord): void` where
    `PageRecord = { id; notebookId; pageNumber; writtenAt?; imagePath?; extractedText?; pageType?; openLoop?; openLoopDescription?; contentHash?; extractedAt? }`
  - `linkEntities(pageId: string, entities: { name: string; type: string }[]): void`
  - `searchNotes(query: string, limit?: number): SearchHit[]` where
    `SearchHit = { pageId; notebookName; pageNumber; writtenAt; snippet }`
  - `getPage(pageId: string): PageFull | undefined`
  - `listNotebooks(): { id; name; excluded; pageCount }[]`
  - `getEntityTimeline(entityName: string): TimelineEntry[]`
  - `getOpenLoops(limit?: number): OpenLoop[]`
  - `listEntities(): { name; type; pageCount }[]`
  - `purgeNotebook(notebookId: string): string[]` — returns image paths that were removed from DB (caller unlinks files)
  - `purgeAll(): void`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';

let repo: Repo;
beforeEach(() => {
  const db = new Database(':memory:');
  migrate(db);
  repo = new Repo(db);
  repo.upsertNotebook({ id: 'n1', name: 'Work Notes' });
  repo.upsertPage({ id: 'p1', notebookId: 'n1', pageNumber: 1, writtenAt: '2026-01-01', extractedText: 'Acme pricing decision', pageType: 'decision', openLoop: false, imagePath: '/img/p1.png' });
  repo.upsertPage({ id: 'p2', notebookId: 'n1', pageNumber: 2, writtenAt: '2026-02-01', extractedText: 'Follow up with Acme team', pageType: 'meeting_notes', openLoop: true, openLoopDescription: 'follow up with Acme', imagePath: '/img/p2.png' });
  repo.linkEntities('p1', [{ name: 'Acme', type: 'company' }]);
  repo.linkEntities('p2', [{ name: 'Acme', type: 'company' }]);
});

test('searchNotes returns receipts', () => {
  const hits = repo.searchNotes('Acme');
  expect(hits.length).toBe(2);
  expect(hits[0]).toHaveProperty('notebookName', 'Work Notes');
  expect(hits[0]).toHaveProperty('pageNumber');
});

test('getEntityTimeline is chronological', () => {
  const t = repo.getEntityTimeline('Acme');
  expect(t.map((x) => x.pageId)).toEqual(['p1', 'p2']);
});

test('getOpenLoops most recent first', () => {
  const loops = repo.getOpenLoops();
  expect(loops.length).toBe(1);
  expect(loops[0].pageId).toBe('p2');
});

test('upsertPage replaces text and updates FTS', () => {
  repo.upsertPage({ id: 'p1', notebookId: 'n1', pageNumber: 1, extractedText: 'totally new content', openLoop: false });
  expect(repo.searchNotes('pricing').length).toBe(0);
  expect(repo.searchNotes('totally').length).toBe(1);
});

test('purgeNotebook returns image paths and removes rows', () => {
  const imgs = repo.purgeNotebook('n1');
  expect(imgs.sort()).toEqual(['/img/p1.png', '/img/p2.png']);
  expect(repo.searchNotes('Acme').length).toBe(0);
  expect(repo.listNotebooks().length).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/repo.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/storage/repo.ts`**

```ts
import type { DB } from './db.js';

export interface PageRecord {
  id: string;
  notebookId: string;
  pageNumber: number;
  writtenAt?: string;
  imagePath?: string;
  extractedText?: string;
  pageType?: string;
  openLoop?: boolean;
  openLoopDescription?: string;
  contentHash?: string;
  extractedAt?: string;
}
export interface SearchHit { pageId: string; notebookName: string; pageNumber: number; writtenAt: string | null; snippet: string; }
export interface PageFull extends PageRecord { notebookName: string; entities: { name: string; type: string }[]; }
export interface TimelineEntry { pageId: string; notebookName: string; pageNumber: number; writtenAt: string | null; snippet: string; }
export interface OpenLoop { pageId: string; notebookName: string; pageNumber: number; writtenAt: string | null; description: string | null; }

export class Repo {
  constructor(private db: DB) {}

  upsertNotebook(n: { id: string; name: string; excluded?: boolean }): void {
    this.db
      .prepare(
        `INSERT INTO notebooks (id, name, excluded) VALUES (@id, @name, @excluded)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name`
      )
      .run({ id: n.id, name: n.name, excluded: n.excluded ? 1 : 0 });
  }

  setExcluded(notebookId: string, excluded: boolean): void {
    this.db.prepare('UPDATE notebooks SET excluded = ? WHERE id = ?').run(excluded ? 1 : 0, notebookId);
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
        id: p.id, notebookId: p.notebookId, pageNumber: p.pageNumber,
        writtenAt: p.writtenAt ?? null, imagePath: p.imagePath ?? null,
        extractedText: p.extractedText ?? null, pageType: p.pageType ?? null,
        openLoop: p.openLoop ? 1 : 0, openLoopDescription: p.openLoopDescription ?? null,
        contentHash: p.contentHash ?? null, extractedAt: p.extractedAt ?? null,
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
      .all(query, limit) as SearchHit[];
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
      id: row.id, notebookId: row.notebook_id, notebookName: row.notebookName,
      pageNumber: row.page_number, writtenAt: row.written_at, imagePath: row.image_path,
      extractedText: row.extracted_text, pageType: row.page_type, openLoop: !!row.open_loop,
      openLoopDescription: row.open_loop_description, contentHash: row.content_hash,
      extractedAt: row.extracted_at, entities,
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
      this.db.prepare('SELECT image_path FROM pages WHERE notebook_id = ? AND image_path IS NOT NULL').all(notebookId) as any[]
    ).map((r) => r.image_path as string);
    this.db.prepare('DELETE FROM notebooks WHERE id = ?').run(notebookId); // cascades pages/page_entities
    return imgs;
  }

  purgeAll(): void {
    this.db.exec('DELETE FROM notebooks; DELETE FROM entities;');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/repo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/storage/repo.ts tests/repo.test.ts
git commit -m "feat: storage repository (search, timeline, open-loops, purge)"
```

---

### Task 5: Sync — manifest (change detection)

**Files:**
- Create: `src/sync/manifest.ts`
- Test: `tests/manifest.test.ts`

**Interfaces:**
- Produces:
  - `hashBuffer(buf: Buffer): string` (sha256 hex)
  - `interface DocManifest { version: string; pages: Record<number, string> }`
  - `interface Manifest { docs: Record<string, DocManifest> }`
  - `loadManifest(path: string): Manifest`
  - `saveManifest(path: string, m: Manifest): void`
  - `docChanged(m: Manifest, docId: string, version: string): boolean`
  - `pageChanged(m: Manifest, docId: string, pageNumber: number, hash: string): boolean`
  - `recordPage(m: Manifest, docId: string, version: string, pageNumber: number, hash: string): void`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { hashBuffer, docChanged, pageChanged, recordPage, loadManifest, saveManifest } from '../src/sync/manifest.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('hashBuffer is stable and content-sensitive', () => {
  expect(hashBuffer(Buffer.from('a'))).toBe(hashBuffer(Buffer.from('a')));
  expect(hashBuffer(Buffer.from('a'))).not.toBe(hashBuffer(Buffer.from('b')));
});

test('doc/page change detection', () => {
  const m = { docs: {} };
  expect(docChanged(m, 'd1', 'v1')).toBe(true);
  recordPage(m, 'd1', 'v1', 1, 'h1');
  expect(docChanged(m, 'd1', 'v1')).toBe(false);
  expect(docChanged(m, 'd1', 'v2')).toBe(true);
  expect(pageChanged(m, 'd1', 1, 'h1')).toBe(false);
  expect(pageChanged(m, 'd1', 1, 'h2')).toBe(true);
  expect(pageChanged(m, 'd1', 2, 'hx')).toBe(true);
});

test('load returns empty manifest when file missing; save/load round-trips', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rmb-'));
  const p = join(dir, 'manifest.json');
  expect(loadManifest(p)).toEqual({ docs: {} });
  const m = { docs: {} };
  recordPage(m, 'd1', 'v1', 1, 'h1');
  saveManifest(p, m);
  expect(loadManifest(p)).toEqual(m);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manifest.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/sync/manifest.ts`**

```ts
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DocManifest { version: string; pages: Record<number, string>; }
export interface Manifest { docs: Record<string, DocManifest>; }

export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function loadManifest(path: string): Manifest {
  if (!existsSync(path)) return { docs: {} };
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  } catch {
    return { docs: {} };
  }
}

export function saveManifest(path: string, m: Manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(m, null, 2));
}

export function docChanged(m: Manifest, docId: string, version: string): boolean {
  return m.docs[docId]?.version !== version;
}

export function pageChanged(m: Manifest, docId: string, pageNumber: number, hash: string): boolean {
  return m.docs[docId]?.pages[pageNumber] !== hash;
}

export function recordPage(m: Manifest, docId: string, version: string, pageNumber: number, hash: string): void {
  const doc = (m.docs[docId] ??= { version, pages: {} });
  doc.version = version;
  doc.pages[pageNumber] = hash;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manifest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/manifest.ts tests/manifest.test.ts
git commit -m "feat: sync manifest for doc/page change detection"
```

---

### Task 6: Extraction — schema & module (the only auto external caller)

**Files:**
- Create: `src/extraction/schema.ts`, `src/extraction/extract.ts`
- Test: `tests/extract.test.ts`

**Interfaces:**
- Produces:
  - `PageExtractionSchema` (zod) and `type PageExtraction`
  - `EXTRACTION_TOOL` — Anthropic tool definition (name `record_page`, input_schema mirroring the zod shape)
  - `interface AnthropicLike { messages: { create(args: any): Promise<any> } }`
  - `extractPage(opts: { imagePath: string; model: string; client: AnthropicLike }): Promise<PageExtraction>`
  - `createAnthropicClient(apiKey: string): AnthropicLike` (thin factory; not used in tests)

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test, vi } from 'vitest';
import { extractPage } from '../src/extraction/extract.js';
import { PageExtractionSchema } from '../src/extraction/schema.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function pngFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rmb-img-'));
  const p = join(dir, 'page.png');
  // 1x1 transparent PNG
  writeFileSync(p, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex'));
  return p;
}

test('extractPage sends a vision + forced-tool request and validates output', async () => {
  const toolResult = {
    extracted_text: 'Discussed Acme pricing',
    page_type: 'meeting_notes',
    entities: [{ name: 'Acme', type: 'company' }],
    open_loop: true,
    open_loop_description: 'follow up on pricing',
  };
  const client = {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', name: 'record_page', input: toolResult }] }),
    },
  };
  const out = await extractPage({ imagePath: pngFixture(), model: 'claude-sonnet-5', client });
  expect(client.messages.create).toHaveBeenCalledOnce();
  const arg = client.messages.create.mock.calls[0][0];
  expect(arg.model).toBe('claude-sonnet-5');
  expect(arg.tool_choice).toEqual({ type: 'tool', name: 'record_page' });
  expect(arg.messages[0].content.some((c: any) => c.type === 'image')).toBe(true);
  expect(() => PageExtractionSchema.parse(out)).not.toThrow();
  expect(out.entities[0].name).toBe('Acme');
});

test('extractPage retries once on invalid output then throws', async () => {
  const client = {
    messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', name: 'record_page', input: { bogus: true } }] }) },
  };
  await expect(extractPage({ imagePath: pngFixture(), model: 'm', client })).rejects.toThrow();
  expect(client.messages.create).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/extract.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/extraction/schema.ts`**

```ts
import { z } from 'zod';

export const PAGE_TYPES = ['journal', 'meeting_notes', 'idea', 'decision', 'reference', 'diagram', 'other'] as const;

export const PageExtractionSchema = z.object({
  extracted_text: z.string(),
  page_type: z.enum(PAGE_TYPES),
  entities: z.array(z.object({ name: z.string(), type: z.string() })).default([]),
  open_loop: z.boolean(),
  open_loop_description: z.string().default(''),
});
export type PageExtraction = z.infer<typeof PageExtractionSchema>;

export const EXTRACTION_TOOL = {
  name: 'record_page',
  description: 'Record the transcription and classification of a single handwritten reMarkable page.',
  input_schema: {
    type: 'object',
    properties: {
      extracted_text: { type: 'string', description: 'The handwriting transcribed to plain text.' },
      page_type: { type: 'string', enum: PAGE_TYPES },
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, type: { type: 'string' } },
          required: ['name', 'type'],
        },
      },
      open_loop: { type: 'boolean', description: 'True if the page poses an unresolved question or follow-up.' },
      open_loop_description: { type: 'string', description: 'Short description of the open loop, empty if none.' },
    },
    required: ['extracted_text', 'page_type', 'entities', 'open_loop', 'open_loop_description'],
  },
} as const;

export const EXTRACTION_PROMPT =
  'Transcribe this handwritten reMarkable page to plain text and classify it. ' +
  'Identify people, projects, companies, and topics as entities. ' +
  'Set open_loop=true only if the page poses a question, a "follow up on X", or an unresolved decision ' +
  'that is not clearly resolved on the page itself. Respond by calling the record_page tool.';
```

- [ ] **Step 4: Write `src/extraction/extract.ts`**

```ts
import { readFileSync } from 'node:fs';
import { EXTRACTION_TOOL, EXTRACTION_PROMPT, PageExtractionSchema, type PageExtraction } from './schema.js';

export interface AnthropicLike {
  messages: { create(args: Record<string, unknown>): Promise<{ content: Array<{ type: string; name?: string; input?: unknown }> }> };
}

export async function createAnthropicClient(apiKey: string): Promise<AnthropicLike> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey }) as unknown as AnthropicLike;
}

export async function extractPage(opts: { imagePath: string; model: string; client: AnthropicLike }): Promise<PageExtraction> {
  const b64 = readFileSync(opts.imagePath).toString('base64');
  const request = {
    model: opts.model,
    max_tokens: 2048,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'record_page' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      },
    ],
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await opts.client.messages.create(request);
    const toolUse = res.content.find((c) => c.type === 'tool_use' && c.name === 'record_page');
    const parsed = PageExtractionSchema.safeParse(toolUse?.input);
    if (parsed.success) return parsed.data;
    lastErr = parsed.error;
  }
  throw new Error(`extraction returned invalid output: ${String(lastErr)}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/extract.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/extraction/ tests/extract.test.ts
git commit -m "feat: extraction module (single forced-tool vision call, isolated)"
```

---

### Task 7: Sync — rmapi wrapper

**Files:**
- Create: `src/sync/rmapi.ts`
- Test: `tests/rmapi.test.ts`

**Interfaces:**
- Produces:
  - `interface RmDoc { id: string; name: string; version: string; tags: string[]; }`
  - `interface Rmapi { listDocuments(): Promise<RmDoc[]>; exportAnnotatedPdf(id: string, outPath: string): Promise<void>; }`
  - `createRmapi(bin: string): Rmapi` — real impl shelling out via `execFile`
  - `parseLsJson(stdout: string): RmDoc[]` — pure parser (this is what's unit-tested)

Note: real rmapi invocation is exercised in the manual test plan, not unit tests. The pure `parseLsJson` is unit-tested. `listDocuments` uses `rmapi ls -l`/metadata; if the installed rmapi cannot emit tags, `tags` is `[]` and sync logs a fallback warning (handled in Task 9).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { parseLsJson } from '../src/sync/rmapi.js';

test('parseLsJson extracts id, name, version, tags', () => {
  const stdout = JSON.stringify([
    { ID: 'abc', VisibleName: 'Work Notes', Version: '7', Tags: ['brain'] },
    { ID: 'def', VisibleName: 'Groceries', Version: '2' },
  ]);
  const docs = parseLsJson(stdout);
  expect(docs).toEqual([
    { id: 'abc', name: 'Work Notes', version: '7', tags: ['brain'] },
    { id: 'def', name: 'Groceries', version: '2', tags: [] },
  ]);
});

test('parseLsJson tolerates empty / malformed input', () => {
  expect(parseLsJson('')).toEqual([]);
  expect(parseLsJson('not json')).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rmapi.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/sync/rmapi.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

export interface RmDoc { id: string; name: string; version: string; tags: string[]; }
export interface Rmapi {
  listDocuments(): Promise<RmDoc[]>;
  exportAnnotatedPdf(id: string, outPath: string): Promise<void>;
}

export function parseLsJson(stdout: string): RmDoc[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((d: any) => ({
    id: String(d.ID ?? d.id ?? ''),
    name: String(d.VisibleName ?? d.name ?? ''),
    version: String(d.Version ?? d.version ?? ''),
    tags: Array.isArray(d.Tags ?? d.tags) ? (d.Tags ?? d.tags).map(String) : [],
  }));
}

export function createRmapi(bin: string): Rmapi {
  return {
    async listDocuments(): Promise<RmDoc[]> {
      // `rmapi --json ls -l` style output; adapt flag if the installed rmapi differs.
      const { stdout } = await pexec(bin, ['--json', 'ls', '-l'], { maxBuffer: 1024 * 1024 * 16 });
      return parseLsJson(stdout);
    },
    async exportAnnotatedPdf(id: string, outPath: string): Promise<void> {
      // `geta` downloads the annotated PDF rendered by the reMarkable cloud.
      await pexec(bin, ['geta', '-o', outPath, id], { maxBuffer: 1024 * 1024 * 64 });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rmapi.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/rmapi.ts tests/rmapi.test.ts
git commit -m "feat: rmapi wrapper + ls parser"
```

---

### Task 8: Sync — PDF rendering (poppler)

**Files:**
- Create: `src/sync/render.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Produces:
  - `interface Renderer { renderPdfToPngs(pdfPath: string, outDir: string, docId: string): Promise<string[]> }` — returns absolute PNG paths, one per page, ordered by page number
  - `createRenderer(pdftoppmBin?: string): Renderer`
  - `parsePngList(files: string[], outDir: string): string[]` — pure: filters/sorts pdftoppm output filenames (`page-1.png`, `page-2.png`, …)

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { parsePngList } from '../src/sync/render.js';

test('parsePngList sorts numerically and filters', () => {
  const files = ['page-10.png', 'page-2.png', 'page-1.png', 'notes.txt'];
  expect(parsePngList(files, '/out')).toEqual(['/out/page-1.png', '/out/page-2.png', '/out/page-10.png']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/sync/render.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const pexec = promisify(execFile);

export interface Renderer {
  renderPdfToPngs(pdfPath: string, outDir: string, docId: string): Promise<string[]>;
}

export function parsePngList(files: string[], outDir: string): string[] {
  return files
    .filter((f) => /^page-\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    .map((f) => join(outDir, f));
}

export function createRenderer(pdftoppmBin = 'pdftoppm'): Renderer {
  return {
    async renderPdfToPngs(pdfPath: string, outDir: string, docId: string): Promise<string[]> {
      const dir = join(outDir, docId);
      mkdirSync(dir, { recursive: true });
      // -r 150 dpi, -png; produces page-1.png, page-2.png, ...
      await pexec(pdftoppmBin, ['-r', '150', '-png', pdfPath, join(dir, 'page')], {
        maxBuffer: 1024 * 1024 * 64,
      });
      return parsePngList(readdirSync(dir), dir);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/sync/render.ts tests/render.test.ts
git commit -m "feat: pdf->png rendering via poppler"
```

---

### Task 9: Sync — orchestrator

**Files:**
- Create: `src/sync/sync.ts`
- Test: `tests/sync.test.ts`

**Interfaces:**
- Consumes: `Repo`, `Rmapi`, `Renderer`, manifest fns, `extractPage`, config helpers `isHardExcluded`/`hasBrainTag`.
- Produces:
  - `interface SyncDeps { repo: Repo; rmapi: Rmapi; renderer: Renderer; extract: (imagePath: string) => Promise<PageExtraction>; manifestPath: string; imagesDir: string; tmpDir: string; log?: (msg: string) => void; }`
  - `interface SyncSummary { docsConsidered: number; docsSynced: number; pagesExtracted: number; skippedExcluded: string[]; skippedUntagged: number; errors: { docId: string; page?: number; message: string }[]; }`
  - `runSync(deps: SyncDeps): Promise<SyncSummary>`

Behavior: list docs → for each: skip if `isHardExcluded(name)` (record) or not `hasBrainTag(tags)` (count) → skip if `!docChanged` → export PDF to tmp → render PNGs → upsert notebook → per page: hash PNG; skip if `!pageChanged`; copy PNG to `imagesDir/<docId>/page-N.png`; `extract`; `upsertPage` + `linkEntities`; `recordPage` in manifest → save manifest after each doc. Per-page/doc errors are caught and pushed to `summary.errors`; the loop continues.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';
import { runSync } from '../src/sync/sync.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'rmb-sync-')); }

test('runSync indexes only #brain, honors hard-exclusion, skips unchanged', async () => {
  const db = new Database(':memory:'); migrate(db);
  const repo = new Repo(db);
  const home = tmp();

  const rmapi = {
    listDocuments: vi.fn().mockResolvedValue([
      { id: 'a', name: 'Work Notes', version: 'v1', tags: ['brain'] },
      { id: 'b', name: 'Groceries', version: 'v1', tags: [] },            // untagged -> skip
      { id: 'c', name: 'Private diary', version: 'v1', tags: ['brain'] }, // hard-excluded -> skip
    ]),
    exportAnnotatedPdf: vi.fn(async (_id: string, out: string) => writeFileSync(out, 'pdf')),
  };
  const renderer = {
    renderPdfToPngs: vi.fn(async (_pdf: string, outDir: string, docId: string) => {
      const p = join(outDir, `${docId}-p1.png`); writeFileSync(p, 'imgdata'); return [p];
    }),
  };
  const extract = vi.fn().mockResolvedValue({
    extracted_text: 'hi', page_type: 'idea', entities: [{ name: 'Acme', type: 'company' }], open_loop: false, open_loop_description: '',
  });

  const deps = { repo, rmapi, renderer, extract, manifestPath: join(home, 'manifest.json'), imagesDir: join(home, 'images'), tmpDir: home };

  const s1 = await runSync(deps as any);
  expect(s1.docsSynced).toBe(1);
  expect(s1.pagesExtracted).toBe(1);
  expect(s1.skippedExcluded).toEqual(['Private diary']);
  expect(s1.skippedUntagged).toBe(1);
  expect(repo.listNotebooks().find((n) => n.id === 'a')?.pageCount).toBe(1);

  // Second run: nothing changed -> no re-extraction
  const s2 = await runSync(deps as any);
  expect(s2.pagesExtracted).toBe(0);
  expect(extract).toHaveBeenCalledTimes(1);
});

test('runSync records per-page errors and continues', async () => {
  const db = new Database(':memory:'); migrate(db);
  const repo = new Repo(db);
  const home = tmp();
  const rmapi = {
    listDocuments: vi.fn().mockResolvedValue([{ id: 'a', name: 'N', version: 'v1', tags: ['brain'] }]),
    exportAnnotatedPdf: vi.fn(async (_id: string, out: string) => writeFileSync(out, 'pdf')),
  };
  const renderer = { renderPdfToPngs: vi.fn(async (_p: string, outDir: string, id: string) => {
    const p = join(outDir, `${id}.png`); writeFileSync(p, 'x'); return [p];
  }) };
  const extract = vi.fn().mockRejectedValue(new Error('api down'));
  const deps = { repo, rmapi, renderer, extract, manifestPath: join(home, 'm.json'), imagesDir: join(home, 'images'), tmpDir: home };
  const s = await runSync(deps as any);
  expect(s.errors.length).toBe(1);
  expect(s.pagesExtracted).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sync.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/sync/sync.ts`**

```ts
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isHardExcluded, hasBrainTag } from '../config.js';
import type { Repo } from '../storage/repo.js';
import type { Rmapi } from './rmapi.js';
import type { Renderer } from './render.js';
import type { PageExtraction } from '../extraction/schema.js';
import { hashBuffer, loadManifest, saveManifest, docChanged, pageChanged, recordPage } from './manifest.js';

export interface SyncDeps {
  repo: Repo;
  rmapi: Rmapi;
  renderer: Renderer;
  extract: (imagePath: string) => Promise<PageExtraction>;
  manifestPath: string;
  imagesDir: string;
  tmpDir: string;
  log?: (msg: string) => void;
}
export interface SyncSummary {
  docsConsidered: number; docsSynced: number; pagesExtracted: number;
  skippedExcluded: string[]; skippedUntagged: number;
  errors: { docId: string; page?: number; message: string }[];
}

export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const log = deps.log ?? (() => {});
  const manifest = loadManifest(deps.manifestPath);
  const summary: SyncSummary = { docsConsidered: 0, docsSynced: 0, pagesExtracted: 0, skippedExcluded: [], skippedUntagged: 0, errors: [] };

  const docs = await deps.rmapi.listDocuments();
  for (const doc of docs) {
    summary.docsConsidered++;
    if (isHardExcluded(doc.name)) { summary.skippedExcluded.push(doc.name); continue; }
    if (!hasBrainTag(doc.tags)) { summary.skippedUntagged++; continue; }
    if (!docChanged(manifest, doc.id, doc.version)) { log(`unchanged: ${doc.name}`); continue; }

    const pdfPath = join(deps.tmpDir, `${doc.id}.pdf`);
    try {
      log(`exporting ${doc.name}…`);
      await deps.rmapi.exportAnnotatedPdf(doc.id, pdfPath);
      const pngs = await deps.renderer.renderPdfToPngs(pdfPath, deps.tmpDir, doc.id);
      deps.repo.upsertNotebook({ id: doc.id, name: doc.name });
      const destDir = join(deps.imagesDir, doc.id);
      mkdirSync(destDir, { recursive: true });

      for (let i = 0; i < pngs.length; i++) {
        const pageNumber = i + 1;
        const hash = hashBuffer(readFileSync(pngs[i]!));
        if (!pageChanged(manifest, doc.id, pageNumber, hash)) continue;
        const dest = join(destDir, `page-${pageNumber}.png`);
        copyFileSync(pngs[i]!, dest);
        try {
          log(`extracting ${doc.name} p${pageNumber} (${pageNumber}/${pngs.length})…`);
          const ex = await deps.extract(dest);
          deps.repo.upsertPage({
            id: `${doc.id}:${pageNumber}`, notebookId: doc.id, pageNumber,
            writtenAt: doc.version && null, // written_at set below from doc modified time when available
            imagePath: dest, extractedText: ex.extracted_text, pageType: ex.page_type,
            openLoop: ex.open_loop, openLoopDescription: ex.open_loop_description,
            contentHash: hash, extractedAt: new Date().toISOString(),
          });
          deps.repo.linkEntities(`${doc.id}:${pageNumber}`, ex.entities);
          recordPage(manifest, doc.id, doc.version, pageNumber, hash);
          summary.pagesExtracted++;
        } catch (err) {
          summary.errors.push({ docId: doc.id, page: pageNumber, message: String((err as Error).message) });
        }
      }
      summary.docsSynced++;
      saveManifest(deps.manifestPath, manifest); // persist progress per doc
    } catch (err) {
      summary.errors.push({ docId: doc.id, message: String((err as Error).message) });
    } finally {
      rmSync(pdfPath, { force: true });
    }
  }
  saveManifest(deps.manifestPath, manifest);
  return summary;
}
```

Note for implementer: `written_at` should be the document's cloud modified time. `RmDoc` currently carries `version`; if the installed rmapi exposes a modified timestamp, add `modified` to `RmDoc`/`parseLsJson` (Task 7) and set `writtenAt: doc.modified`. Until then leave `writtenAt` null and remove the placeholder `doc.version && null` expression — set `writtenAt: doc.modified ?? null`. **Fix `RmDoc` to include `modified: string` and map `ModifiedClient`/`Modified` in `parseLsJson` as part of this task**, and update the Task 7 test expectations to include `modified`.

- [ ] **Step 4: Add `modified` to RmDoc and parser**

Edit `src/sync/rmapi.ts`: add `modified: string` to `RmDoc`; in `parseLsJson` map `modified: String(d.ModifiedClient ?? d.Modified ?? d.modified ?? '')`. Update `tests/rmapi.test.ts` expectations to include `modified` (use `''` when absent, or a value when the fixture provides `ModifiedClient`). In `sync.ts` set `writtenAt: doc.modified || null`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/sync.test.ts tests/rmapi.test.ts`
Expected: PASS. (Update the sync test fixtures to include `modified: '2026-01-01'` on each doc.)

- [ ] **Step 6: Commit**

```bash
git add src/sync/sync.ts src/sync/rmapi.ts tests/sync.test.ts tests/rmapi.test.ts
git commit -m "feat: sync orchestrator (opt-in, change-detection, resilient)"
```

---

### Task 10: MCP server

**Files:**
- Create: `src/mcp/server.ts`, `src/mcp/tools.ts`
- Test: `tests/mcp-tools.test.ts`

**Interfaces:**
- Produces:
  - `buildToolHandlers(repo: Repo)` returning an object mapping tool name → `(args) => result` for the 6 tools. This pure factory is unit-tested; `server.ts` wires it to the MCP transport.
  - `startServer()` in `server.ts` — opens the DB at `config.dbPath`, runs `migrate`, registers tools over stdio transport.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';
import { buildToolHandlers } from '../src/mcp/tools.js';

let handlers: ReturnType<typeof buildToolHandlers>;
beforeEach(() => {
  const db = new Database(':memory:'); migrate(db);
  const repo = new Repo(db);
  repo.upsertNotebook({ id: 'n1', name: 'Work' });
  repo.upsertPage({ id: 'p1', notebookId: 'n1', pageNumber: 1, writtenAt: '2026-01-01', extractedText: 'Acme pricing', openLoop: true, openLoopDescription: 'decide price', imagePath: '/i/p1.png' });
  repo.linkEntities('p1', [{ name: 'Acme', type: 'company' }]);
  handlers = buildToolHandlers(repo);
});

test('search_notes returns receipts', () => {
  const r = handlers.search_notes({ query: 'Acme' });
  expect(r.results[0]).toMatchObject({ notebookName: 'Work', pageNumber: 1 });
});
test('get_open_loops works', () => {
  expect(handlers.get_open_loops({}).results[0].pageId).toBe('p1');
});
test('get_entity_timeline works', () => {
  expect(handlers.get_entity_timeline({ entity_name: 'Acme' }).results.length).toBe(1);
});
test('get_page returns image path + text', () => {
  const r = handlers.get_page({ page_id: 'p1' });
  expect(r.imagePath).toBe('/i/p1.png');
  expect(r.extractedText).toContain('Acme');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp-tools.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/mcp/tools.ts`**

```ts
import type { Repo } from '../storage/repo.js';

export function buildToolHandlers(repo: Repo) {
  return {
    search_notes: ({ query, limit }: { query: string; limit?: number }) => ({ results: repo.searchNotes(query, limit) }),
    get_page: ({ page_id }: { page_id: string }) => {
      const p = repo.getPage(page_id);
      return p ? { ...p } : { error: 'not found' };
    },
    list_notebooks: () => ({ results: repo.listNotebooks() }),
    get_entity_timeline: ({ entity_name }: { entity_name: string }) => ({ results: repo.getEntityTimeline(entity_name) }),
    get_open_loops: ({ limit }: { limit?: number }) => ({ results: repo.getOpenLoops(limit) }),
    list_entities: () => ({ results: repo.listEntities() }),
  };
}
```

- [ ] **Step 4: Write `src/mcp/server.ts`**

```ts
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { openDb, migrate } from '../storage/db.js';
import { Repo } from '../storage/repo.js';
import { buildToolHandlers } from './tools.js';

export async function startServer(): Promise<void> {
  const cfg = loadConfig();
  const db = openDb(cfg.dbPath);
  migrate(db);
  const repo = new Repo(db);
  const h = buildToolHandlers(repo);

  const server = new McpServer({ name: 'rm-brain', version: '0.1.0' });

  server.tool('search_notes', 'Full-text search over notebook pages.', { query: z.string(), limit: z.number().optional() },
    async (a) => ({ content: [{ type: 'text', text: JSON.stringify(h.search_notes(a)) }] }));
  server.tool('get_page', 'Get full text + source image path for a page.', { page_id: z.string() },
    async (a) => ({ content: [{ type: 'text', text: JSON.stringify(h.get_page(a)) }] }));
  server.tool('list_notebooks', 'List indexed notebooks.', {},
    async () => ({ content: [{ type: 'text', text: JSON.stringify(h.list_notebooks()) }] }));
  server.tool('get_entity_timeline', 'Chronological pages mentioning an entity.', { entity_name: z.string() },
    async (a) => ({ content: [{ type: 'text', text: JSON.stringify(h.get_entity_timeline(a)) }] }));
  server.tool('get_open_loops', 'Unresolved questions/follow-ups, most recent first.', { limit: z.number().optional() },
    async (a) => ({ content: [{ type: 'text', text: JSON.stringify(h.get_open_loops(a)) }] }));
  server.tool('list_entities', 'List auto-tagged entities.', {},
    async () => ({ content: [{ type: 'text', text: JSON.stringify(h.list_entities()) }] }));

  await server.connect(new StdioServerTransport());
}

startServer().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/mcp-tools.test.ts && npx tsc --noEmit`
Expected: tool tests PASS; tsc clean. (If the installed MCP SDK API differs, adapt `server.ts` to the SDK's current `tool`/`registerTool` signature — the unit-tested `tools.ts` stays unchanged.)

- [ ] **Step 6: Commit**

```bash
git add src/mcp/ tests/mcp-tools.test.ts
git commit -m "feat: MCP server exposing 6 read-only tools"
```

---

### Task 11: CLI (beautiful terminal)

**Files:**
- Create: `src/cli.ts`, `src/cli/doctor.ts`, `src/cli/render-table.ts`
- Test: `tests/doctor.test.ts`, `tests/render-table.test.ts`

**Interfaces:**
- Produces:
  - `runDoctor(env, checks): DoctorResult[]` (pure, injectable checks) in `src/cli/doctor.ts`
  - `notebooksTable(rows): string` in `src/cli/render-table.ts`
  - `src/cli.ts` — arg dispatch for `setup | sync | search | list | exclude | include | purge | doctor | mcp` using `@clack/prompts`, `picocolors`, `cli-table3`.

- [ ] **Step 1: Write failing tests**

`tests/doctor.test.ts`:
```ts
import { expect, test } from 'vitest';
import { runDoctor } from '../src/cli/doctor.js';

test('doctor reports each dependency status', () => {
  const res = runDoctor(
    { RMAPI_BIN: 'rmapi', ANTHROPIC_API_KEY: 'k' } as any,
    { hasBin: (b: string) => b === 'rmapi' || b === 'pdftoppm', homeWritable: true }
  );
  const byName = Object.fromEntries(res.map((r) => [r.name, r.ok]));
  expect(byName['rmapi']).toBe(true);
  expect(byName['poppler (pdftoppm)']).toBe(true);
  expect(byName['ANTHROPIC_API_KEY']).toBe(true);
  expect(byName['data home writable']).toBe(true);
});

test('doctor flags missing api key and poppler', () => {
  const res = runDoctor({ RMAPI_BIN: 'rmapi' } as any, { hasBin: () => false, homeWritable: true });
  const byName = Object.fromEntries(res.map((r) => [r.name, r.ok]));
  expect(byName['poppler (pdftoppm)']).toBe(false);
  expect(byName['ANTHROPIC_API_KEY']).toBe(false);
});
```

`tests/render-table.test.ts`:
```ts
import { expect, test } from 'vitest';
import { notebooksTable } from '../src/cli/render-table.js';

test('notebooksTable includes names and counts', () => {
  const out = notebooksTable([{ id: 'n1', name: 'Work', excluded: false, pageCount: 3 }]);
  expect(out).toContain('Work');
  expect(out).toContain('3');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/doctor.test.ts tests/render-table.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `src/cli/doctor.ts`**

```ts
import { loadConfig } from '../config.js';

export interface DoctorResult { name: string; ok: boolean; detail: string; }
export interface DoctorChecks { hasBin: (bin: string) => boolean; homeWritable: boolean; }

export function runDoctor(env: NodeJS.ProcessEnv, checks: DoctorChecks): DoctorResult[] {
  const cfg = loadConfig(env);
  return [
    { name: 'rmapi', ok: checks.hasBin(cfg.rmapiBin), detail: cfg.rmapiBin },
    { name: 'poppler (pdftoppm)', ok: checks.hasBin('pdftoppm'), detail: 'brew install poppler' },
    { name: 'ANTHROPIC_API_KEY', ok: !!cfg.anthropicApiKey, detail: cfg.anthropicApiKey ? 'set' : 'missing (needed for sync)' },
    { name: 'data home writable', ok: checks.homeWritable, detail: cfg.home },
  ];
}
```

- [ ] **Step 4: Write `src/cli/render-table.ts`**

```ts
import Table from 'cli-table3';

export function notebooksTable(rows: { id: string; name: string; excluded: boolean; pageCount: number }[]): string {
  const t = new Table({ head: ['Notebook', 'Pages', 'Excluded'] });
  for (const r of rows) t.push([r.name, String(r.pageCount), r.excluded ? 'yes' : '']);
  return t.toString();
}
```

- [ ] **Step 5: Write `src/cli.ts`**

```ts
#!/usr/bin/env node
import { accessSync, constants, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig } from './config.js';
import { openDb, migrate } from './storage/db.js';
import { Repo } from './storage/repo.js';
import { runDoctor } from './cli/doctor.js';
import { notebooksTable } from './cli/render-table.js';
import { createRmapi } from './sync/rmapi.js';
import { createRenderer } from './sync/render.js';
import { runSync } from './sync/sync.js';
import { extractPage, createAnthropicClient } from './extraction/extract.js';

function hasBin(bin: string): boolean {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }); return true; } catch { return false; }
}
function openRepo() { const cfg = loadConfig(); mkdirSync(cfg.home, { recursive: true }); const db = openDb(cfg.dbPath); migrate(db); return { cfg, repo: new Repo(db) }; }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'doctor': {
      const cfg = loadConfig();
      let writable = true; try { mkdirSync(cfg.home, { recursive: true }); accessSync(cfg.home, constants.W_OK); } catch { writable = false; }
      const res = runDoctor(process.env, { hasBin, homeWritable: writable });
      p.intro(pc.bold('rm-brain doctor'));
      for (const r of res) p.log.message(`${r.ok ? pc.green('✓') : pc.red('✗')} ${r.name} — ${r.detail}`);
      p.outro(res.every((r) => r.ok) ? pc.green('All good') : pc.yellow('Some checks failed'));
      break;
    }
    case 'list': {
      const { repo } = openRepo();
      console.log(notebooksTable(repo.listNotebooks()));
      break;
    }
    case 'search': {
      const { repo } = openRepo();
      const q = rest.join(' ');
      for (const h of repo.searchNotes(q)) console.log(`${pc.cyan(h.notebookName)} p${h.pageNumber} ${pc.dim(h.writtenAt ?? '')}\n  ${h.snippet}`);
      break;
    }
    case 'exclude':
    case 'include': {
      const { cfg, repo } = openRepo();
      const name = rest.join(' ');
      const nb = repo.listNotebooks().find((n) => n.name === name);
      if (!nb) { p.log.error(`No indexed notebook named "${name}"`); break; }
      if (cmd === 'exclude') {
        const imgs = repo.purgeNotebook(nb.id);
        for (const img of imgs) rmSync(img, { force: true });
        repo.upsertNotebook({ id: nb.id, name: nb.name, excluded: true });
        p.log.success(`Excluded and purged "${name}" (${imgs.length} images removed)`);
      } else {
        repo.setExcluded(nb.id, false);
        p.log.success(`Included "${name}" (re-sync to re-index)`);
      }
      break;
    }
    case 'purge': {
      const { cfg, repo } = openRepo();
      const ok = await p.confirm({ message: `Delete the ENTIRE local index at ${cfg.home}? This cannot be undone.` });
      if (ok === true) { repo.purgeAll(); rmSync(cfg.imagesDir, { recursive: true, force: true }); rmSync(cfg.manifestPath, { force: true }); p.log.success('Index purged.'); }
      else p.log.message('Aborted.');
      break;
    }
    case 'sync': {
      const { cfg, repo } = openRepo();
      if (!cfg.anthropicApiKey) { p.log.error('ANTHROPIC_API_KEY not set — required for sync.'); process.exit(1); }
      const client = await createAnthropicClient(cfg.anthropicApiKey);
      const spin = p.spinner(); spin.start('Syncing…');
      const summary = await runSync({
        repo, rmapi: createRmapi(cfg.rmapiBin), renderer: createRenderer(),
        extract: (img) => extractPage({ imagePath: img, model: cfg.anthropicModel, client }),
        manifestPath: cfg.manifestPath, imagesDir: cfg.imagesDir, tmpDir: cfg.home,
        log: (m) => spin.message(m),
      });
      spin.stop('Sync complete');
      p.log.message(`Docs synced: ${summary.docsSynced}, pages extracted: ${summary.pagesExtracted}, skipped (untagged): ${summary.skippedUntagged}, hard-excluded: ${summary.skippedExcluded.length}, errors: ${summary.errors.length}`);
      break;
    }
    case 'setup': {
      await runSetupWizard();
      break;
    }
    case 'mcp': {
      await import('./mcp/server.js');
      break;
    }
    default:
      console.log(`rm-brain <command>\n  setup   interactive setup wizard\n  sync    pull #brain notebooks and index them\n  search  <query>\n  list    show indexed notebooks\n  exclude <notebook> / include <notebook>\n  purge   delete the entire local index\n  doctor  check dependencies\n  mcp     start the MCP server (for Claude Desktop)`);
  }
}

async function runSetupWizard(): Promise<void> {
  const cfg = loadConfig();
  p.intro(pc.bold('rm-brain setup'));
  if (!hasBin(cfg.rmapiBin)) p.log.warn(`rmapi not found. Install it, then run: ${pc.cyan(cfg.rmapiBin)} (it will prompt to pair a one-time code).`);
  else p.log.success('rmapi found.');
  if (!hasBin('pdftoppm')) p.log.warn('poppler not found. Install with: brew install poppler');
  else p.log.success('poppler found.');
  if (!cfg.anthropicApiKey) p.log.warn('Set ANTHROPIC_API_KEY in your environment before running sync.');
  const cmd = process.execPath.includes('node') ? 'rm-brain' : 'rm-brain';
  const block = JSON.stringify({ mcpServers: { 'rm-brain': { command: cmd, args: ['mcp'], env: { RM_BRAIN_HOME: cfg.home } } } }, null, 2);
  p.note(block, 'Paste into Claude Desktop config → mcpServers');
  p.outro('Run `rm-brain doctor` to verify, then `rm-brain sync`.');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Run tests + typecheck + build**

Run: `npx vitest run tests/doctor.test.ts tests/render-table.test.ts && npx tsc --noEmit && npm run build`
Expected: tests PASS, tsc clean, build produces `dist/cli.js`, `dist/index.js`, `dist/mcp/server.js`.

- [ ] **Step 7: Smoke-test the CLI**

Run: `node dist/cli.js doctor`
Expected: prints a checklist (rmapi ✗ expected since not installed, poppler ✓, API key ✗, home ✓).

- [ ] **Step 8: Commit**

```bash
git add src/cli.ts src/cli/ tests/doctor.test.ts tests/render-table.test.ts
git commit -m "feat: CLI (setup wizard, sync, search, list, exclude, purge, doctor, mcp)"
```

---

### Task 12: README + docs

**Files:**
- Create: `README.md`, `LICENSE`

**Interfaces:** none (docs).

- [ ] **Step 1: Write `README.md`**

Include, verbatim structure:
1. One-paragraph pitch (local-first second brain for reMarkable, searched via Claude Desktop).
2. **How it works** diagram (copy the arrow diagram from the spec).
3. **What data goes where** — DB/images/manifest under `~/.rm-brain`; the ONLY network egress is page PNGs to the Claude API (sync) and queries+snippets over MCP (search). Nothing else leaves the machine.
4. **Privacy model** — opt-in `#brain` tag; hard exclusion `/^\./`, `/private/i`, `/noindex/i` wins even over `#brain`; `exclude` purges.
5. **Prerequisites** — Node 20+, `brew install poppler`, rmapi installed + paired, Anthropic API key.
6. **Install** — `npm install && npm run build` (or `npm link` for global `rm-brain`).
7. **Setup** — `rm-brain setup` (wizard), copy the printed block into Claude Desktop's config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS), restart Claude Desktop.
8. **Usage** — tag a notebook `#brain`, `rm-brain sync`, then ask Claude Desktop questions; CLI reference table.
9. **Config** — env var table (`RM_BRAIN_HOME`, `RMAPI_BIN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`).
10. **Cost note** — one Claude vision call per new/changed page; model configurable.
11. **Not in v1** — vector search, notifications, dashboards, web UI.

- [ ] **Step 2: Write `LICENSE`** (MIT, current year, author name).

- [ ] **Step 3: Full test + build gate**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass, tsc clean, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: README (setup, privacy, data flow) + MIT license"
```

---

## Manual Test Plan (post-implementation, against ONE real non-sensitive notebook)

Run these against a real reMarkable account after building. This is the acceptance gate before pointing the tool at anything private.

1. `rm-brain doctor` → rmapi, poppler, API key, home all green.
2. On the tablet, tag ONE non-sensitive notebook `#brain`; sync it to the cloud.
3. `rm-brain sync` → watch it list only the tagged doc, export, render, extract; summary shows `docsSynced: 1`.
4. `rm-brain list` → the notebook and its page count appear.
5. `rm-brain search "<phrase you know is in it>"` → returns the right page(s) with notebook/page/date.
6. In Claude Desktop (MCP connected), ask a natural-language question → answer cites notebook/page/date; `get_page` can show the scanned image.
7. Add "TODO: follow up with X" on a page, re-sync, ask Claude "what open loops do I have" → it surfaces.
8. `rm-brain exclude "<notebook>"` → `list` shows it gone; confirm images removed from `~/.rm-brain/images/<id>`.
9. Rename a second notebook to include `private`, tag it `#brain`, `rm-brain sync` → confirm it is skipped (hard-exclusion beats opt-in).
10. `rm-brain purge` → confirm the entire index and images are deleted.

---

## Self-Review Notes

- **Spec coverage:** sync (T7–9), extraction isolation (T6), storage schema+FTS (T3–4), 6 MCP tools (T10), opt-in `#brain` + hard exclusion (T2, enforced T9), CLI admin incl. purge/exclude-that-purges (T11), env config/no secrets (T2, T1 gitignore), receipts in every result (T4 queries), manual test plan (above). All covered.
- **written_at:** resolved in T9 Step 4 by adding `modified` to `RmDoc`/`parseLsJson` and mapping it to `pages.written_at`.
- **Tag-availability fallback:** if rmapi can't emit tags, `tags` is `[]` → docs are treated as untagged (skipped), which is fail-safe (nothing sent). README documents the naming-convention fallback for that case.
