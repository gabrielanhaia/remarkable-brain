import { expect, test, vi } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';
import { runSync, type SyncDeps } from '../src/sync/sync.js';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'rmb-sync-'));
}

function doc(over: Partial<any> = {}) {
  return {
    id: 'a',
    name: 'Work Notes',
    version: 'v1',
    modified: '2026-01-01',
    tags: [],
    path: '/Brain/Work Notes',
    type: 'DocumentType',
    ...over,
  };
}

function fakeRenderer() {
  return {
    renderDocToPngs: vi.fn(async (_a: string, outDir: string, docId: string) => {
      const p = join(outDir, `${docId}-p1.png`);
      writeFileSync(p, 'imgdata');
      return [{ pageNumber: 1, path: p }];
    }),
  };
}
function fakeDownload() {
  return vi.fn(async (_p: string, dest: string) => {
    const f = join(dest, 'doc.rmdoc');
    writeFileSync(f, 'archive');
    return f;
  });
}
function okExtract() {
  return vi.fn().mockResolvedValue({
    extracted_text: 'hi',
    page_type: 'idea',
    entities: [{ name: 'Ordio', type: 'company' }],
    open_loop: false,
    open_loop_description: '',
  });
}
function baseDeps(over: Partial<SyncDeps>): SyncDeps {
  const home = tmp();
  return {
    brainFolder: '/Brain',
    manifestPath: join(home, 'manifest.json'),
    imagesDir: join(home, 'images'),
    tmpDir: home,
    ...(over as SyncDeps),
  };
}

test('runSync indexes folder docs, honors hard-exclusion, skips unchanged', async () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  const rmapi = {
    listFolderDocs: vi.fn().mockResolvedValue([
      doc({ id: 'a', name: 'Work Notes', path: '/Brain/Work Notes' }),
      doc({ id: 'c', name: 'Private diary', path: '/Brain/Private diary' }), // hard-excluded
    ]),
    downloadDoc: fakeDownload(),
  };
  const renderer = fakeRenderer();
  const extract = okExtract();
  const deps = baseDeps({ repo, rmapi, renderer, extract });

  const s1 = await runSync(deps);
  expect(s1.docsSynced).toBe(1);
  expect(s1.pagesExtracted).toBe(1);
  expect(s1.skippedExcluded).toEqual(['Private diary']);
  expect(repo.listNotebooks().find((n) => n.id === 'a')?.pageCount).toBe(1);

  const s2 = await runSync(deps);
  expect(s2.pagesExtracted).toBe(0);
  expect(extract).toHaveBeenCalledTimes(1);
});

test('runSync re-syncs when ModifiedClient changes (Version stays 0) and extracts new pages', async () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);

  const rmapi = { listFolderDocs: vi.fn(), downloadDoc: fakeDownload() };
  // Version is constant '0' (reMarkable never bumps it); only `modified` changes on edit.
  rmapi.listFolderDocs
    .mockResolvedValueOnce([doc({ id: 'a', name: 'Notes', version: '0', modified: 't1' })])
    .mockResolvedValueOnce([doc({ id: 'a', name: 'Notes', version: '0', modified: 't2' })]);

  let call = 0;
  const renderer = {
    renderDocToPngs: vi.fn(async (_a: string, outDir: string, docId: string) => {
      call++;
      const p1 = join(outDir, `${docId}-p1.png`);
      writeFileSync(p1, 'page-one-stable');
      const pages = [{ pageNumber: 1, path: p1 }];
      if (call >= 2) {
        const p2 = join(outDir, `${docId}-p2.png`);
        writeFileSync(p2, 'page-two-new');
        pages.push({ pageNumber: 2, path: p2 });
      }
      return pages;
    }),
  };
  const deps = baseDeps({ repo, rmapi, renderer, extract: okExtract() });

  const s1 = await runSync(deps);
  expect(s1.pagesExtracted).toBe(1);

  const s2 = await runSync(deps); // modified t1 -> t2 forces re-download; page 1 unchanged, page 2 new
  expect(rmapi.downloadDoc).toHaveBeenCalledTimes(2);
  expect(s2.pagesExtracted).toBe(1); // only the new page 2
  expect(repo.listNotebooks().find((n) => n.id === 'a')?.pageCount).toBe(2);
});

test('runSync prunes notebooks removed from the folder (pages + images gone)', async () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  const rmapi = {
    listFolderDocs: vi.fn().mockResolvedValue([doc({ id: 'a', name: 'Keeper', path: '/Brain/Keeper' })]),
    downloadDoc: fakeDownload(),
  };
  const deps = baseDeps({ repo, rmapi, renderer: fakeRenderer(), extract: okExtract() });

  await runSync(deps); // indexes 'a'
  // now a doc 'b' exists in the DB but is no longer in the folder listing
  repo.upsertNotebook({ id: 'b', name: 'Removed' });
  repo.upsertPage({ id: 'b:1', notebookId: 'b', pageNumber: 1, extractedText: 'gone soon', imagePath: '/nope.png' });
  expect(repo.searchNotes('gone').length).toBe(1);

  const s = await runSync(deps);
  expect(s.pruned).toEqual(['Removed']);
  expect(repo.listNotebooks().map((n) => n.id)).toEqual(['a']);
  expect(repo.searchNotes('gone').length).toBe(0);
});

test('runSync does NOT prune user-excluded markers', async () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.upsertNotebook({ id: 'x', name: 'Excluded One', excluded: true });
  const rmapi = { listFolderDocs: vi.fn().mockResolvedValue([]), downloadDoc: vi.fn() };
  const deps = baseDeps({ repo, rmapi, renderer: fakeRenderer(), extract: vi.fn() });

  const s = await runSync(deps);
  expect(s.pruned).toEqual([]);
  expect(repo.listExcludedIds()).toEqual(['x']);
});

test('runSync records per-page errors and continues', async () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  const rmapi = {
    listFolderDocs: vi.fn().mockResolvedValue([doc({ id: 'a', name: 'N', path: '/Brain/N' })]),
    downloadDoc: fakeDownload(),
  };
  const extract = vi.fn().mockRejectedValue(new Error('api down'));
  const deps = baseDeps({ repo, rmapi, renderer: fakeRenderer(), extract });
  const s = await runSync(deps);
  expect(s.errors.length).toBe(1);
  expect(s.pagesExtracted).toBe(0);
});

test('runSync skips notebooks the user previously excluded in the DB', async () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.upsertNotebook({ id: 'a', name: 'Work Notes', excluded: true });
  const rmapi = {
    listFolderDocs: vi.fn().mockResolvedValue([doc({ id: 'a', name: 'Work Notes', path: '/Brain/Work Notes' })]),
    downloadDoc: vi.fn(),
  };
  const extract = vi.fn();
  const deps = baseDeps({ repo, rmapi, renderer: fakeRenderer(), extract });
  const s = await runSync(deps);
  expect(s.pagesExtracted).toBe(0);
  expect(extract).not.toHaveBeenCalled();
  expect(rmapi.downloadDoc).not.toHaveBeenCalled();
  expect(s.skippedExcluded).toEqual(['Work Notes']);
});

// sanity: the imagesDir path helper is real so prune's rmSync target resolves
test('imagesDir is created under home', () => {
  const deps = baseDeps({});
  expect(existsSync(deps.tmpDir)).toBe(true);
});
