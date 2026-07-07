import { expect, test, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';
import { runSync, type SyncDeps } from '../src/sync/sync.js';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'rmb-sync-'));
}

test('runSync indexes only #brain, honors hard-exclusion, skips unchanged', async () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  const home = tmp();

  const rmapi = {
    listDocuments: vi.fn().mockResolvedValue([
      { id: 'a', name: 'Work Notes', version: 'v1', modified: '2026-01-01', tags: ['brain'] },
      { id: 'b', name: 'Groceries', version: 'v1', modified: '2026-01-01', tags: [] }, // untagged -> skip
      { id: 'c', name: 'Private diary', version: 'v1', modified: '2026-01-01', tags: ['brain'] }, // hard-excluded
    ]),
    exportAnnotatedPdf: vi.fn(async (_id: string, out: string) => writeFileSync(out, 'pdf')),
  };
  const renderer = {
    renderPdfToPngs: vi.fn(async (_pdf: string, outDir: string, docId: string) => {
      const p = join(outDir, `${docId}-p1.png`);
      writeFileSync(p, 'imgdata');
      return [p];
    }),
  };
  const extract = vi.fn().mockResolvedValue({
    extracted_text: 'hi',
    page_type: 'idea',
    entities: [{ name: 'Ordio', type: 'company' }],
    open_loop: false,
    open_loop_description: '',
  });

  const deps: SyncDeps = {
    repo,
    rmapi,
    renderer,
    extract,
    manifestPath: join(home, 'manifest.json'),
    imagesDir: join(home, 'images'),
    tmpDir: home,
  };

  const s1 = await runSync(deps);
  expect(s1.docsSynced).toBe(1);
  expect(s1.pagesExtracted).toBe(1);
  expect(s1.skippedExcluded).toEqual(['Private diary']);
  expect(s1.skippedUntagged).toBe(1);
  expect(repo.listNotebooks().find((n) => n.id === 'a')?.pageCount).toBe(1);

  // Second run: nothing changed -> no re-extraction
  const s2 = await runSync(deps);
  expect(s2.pagesExtracted).toBe(0);
  expect(extract).toHaveBeenCalledTimes(1);
});

test('runSync records per-page errors and continues', async () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  const home = tmp();
  const rmapi = {
    listDocuments: vi
      .fn()
      .mockResolvedValue([{ id: 'a', name: 'N', version: 'v1', modified: '2026-01-01', tags: ['brain'] }]),
    exportAnnotatedPdf: vi.fn(async (_id: string, out: string) => writeFileSync(out, 'pdf')),
  };
  const renderer = {
    renderPdfToPngs: vi.fn(async (_p: string, outDir: string, id: string) => {
      const p = join(outDir, `${id}.png`);
      writeFileSync(p, 'x');
      return [p];
    }),
  };
  const extract = vi.fn().mockRejectedValue(new Error('api down'));
  const deps: SyncDeps = {
    repo,
    rmapi,
    renderer,
    extract,
    manifestPath: join(home, 'm.json'),
    imagesDir: join(home, 'images'),
    tmpDir: home,
  };
  const s = await runSync(deps);
  expect(s.errors.length).toBe(1);
  expect(s.pagesExtracted).toBe(0);
});

test('runSync skips notebooks the user previously excluded in the DB', async () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.upsertNotebook({ id: 'a', name: 'Work Notes', excluded: true });
  const home = tmp();
  const rmapi = {
    listDocuments: vi
      .fn()
      .mockResolvedValue([{ id: 'a', name: 'Work Notes', version: 'v1', modified: '2026-01-01', tags: ['brain'] }]),
    exportAnnotatedPdf: vi.fn(),
  };
  const renderer = { renderPdfToPngs: vi.fn() };
  const extract = vi.fn();
  const deps: SyncDeps = {
    repo,
    rmapi,
    renderer,
    extract,
    manifestPath: join(home, 'm.json'),
    imagesDir: join(home, 'images'),
    tmpDir: home,
  };
  const s = await runSync(deps);
  expect(s.pagesExtracted).toBe(0);
  expect(extract).not.toHaveBeenCalled();
  expect(rmapi.exportAnnotatedPdf).not.toHaveBeenCalled();
  expect(s.skippedExcluded).toEqual(['Work Notes']);
});
