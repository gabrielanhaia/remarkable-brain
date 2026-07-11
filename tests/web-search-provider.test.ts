import { beforeEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';
import { FtsSearchProvider, HybridSearchProvider } from '../src/web/search/provider.js';
import type { Embedder } from '../src/search/embedder.js';

let repo: Repo;
let provider: FtsSearchProvider;
beforeEach(() => {
  const db = new Database(':memory:');
  migrate(db);
  repo = new Repo(db);
  repo.upsertNotebook({ id: 'n1', name: 'Work Notes' });
  repo.upsertNotebook({ id: 'n2', name: 'Personal' });
  repo.upsertPage({
    id: 'p1', notebookId: 'n1', pageNumber: 1, writtenAt: '2026-01-01',
    extractedText: 'Acme pricing decision', pageType: 'decision', openLoop: false,
  });
  repo.upsertPage({
    id: 'p2', notebookId: 'n1', pageNumber: 2, writtenAt: '2026-02-01',
    extractedText: 'Follow up with Acme team', pageType: 'meeting_notes', openLoop: true,
    openLoopDescription: 'follow up',
  });
  repo.upsertPage({
    id: 'p3', notebookId: 'n2', pageNumber: 1, writtenAt: '2026-03-01',
    extractedText: 'Acme in my personal notebook', pageType: 'note', openLoop: false,
  });
  provider = new FtsSearchProvider(repo);
});

test('returns matching hits, ranked', async () => {
  const hits = await provider.search('Acme');
  expect(hits.map((h) => h.pageId).sort()).toEqual(['p1', 'p2', 'p3']);
});

test('empty / whitespace query returns no hits', async () => {
  expect(await provider.search('')).toEqual([]);
  expect(await provider.search('   ')).toEqual([]);
});

test('does not reject on FTS operator characters', async () => {
  await expect(provider.search('Acme: pricing*')).resolves.toBeDefined();
});

test('notebook filter restricts to one notebook by display name', async () => {
  const hits = await provider.search('Acme', { notebook: 'Personal' });
  expect(hits.map((h) => h.pageId)).toEqual(['p3']);
});

test('type filter restricts to a page type', async () => {
  const hits = await provider.search('Acme', { type: 'decision' });
  expect(hits.map((h) => h.pageId)).toEqual(['p1']);
});

test('openLoop filter keeps only open-loop pages', async () => {
  const hits = await provider.search('Acme', { openLoop: true });
  expect(hits.map((h) => h.pageId)).toEqual(['p2']);
});

test('combined filters intersect', async () => {
  expect((await provider.search('Acme', { notebook: 'Work Notes', type: 'decision' })).map((h) => h.pageId)).toEqual(['p1']);
  expect((await provider.search('Acme', { notebook: 'Work Notes', openLoop: true })).map((h) => h.pageId)).toEqual(['p2']);
});

// A deterministic, fully-local mock embedder: maps text to a 3-dim concept vector by keyword.
const mockEmbedder: Embedder = {
  dim: 3,
  async embed(texts) {
    return texts.map(
      (t) =>
        new Float32Array([
          /acme/i.test(t) ? 1 : 0,
          /pric|cost|decision/i.test(t) ? 1 : 0,
          /personal|team|follow/i.test(t) ? 1 : 0,
        ])
    );
  },
};

test('hybrid provider surfaces a semantic match that keyword search misses', async () => {
  // embed every page with the mock embedder
  for (const { id, text } of repo.pagesNeedingEmbedding()) {
    const [v] = await mockEmbedder.embed([text]);
    repo.setEmbedding(id, v!);
  }
  const hybrid = new HybridSearchProvider(repo, mockEmbedder, provider);
  // "cost" has no keyword hit, but is semantically near "pricing decision" (p1)
  expect(await provider.search('cost')).toEqual([]);
  const hits = await hybrid.search('cost');
  expect(hits.map((h) => h.pageId)).toContain('p1');
});

test('hybrid provider still returns keyword hits and respects filters', async () => {
  for (const { id, text } of repo.pagesNeedingEmbedding()) {
    const [v] = await mockEmbedder.embed([text]);
    repo.setEmbedding(id, v!);
  }
  const hybrid = new HybridSearchProvider(repo, mockEmbedder, provider);
  const hits = await hybrid.search('Acme', { notebook: 'Personal' });
  expect(hits.every((h) => h.notebookName === 'Personal')).toBe(true);
  expect(hits.map((h) => h.pageId)).toContain('p3');
});
