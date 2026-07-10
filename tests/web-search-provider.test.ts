import { beforeEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';
import { FtsSearchProvider } from '../src/web/search/provider.js';

let provider: FtsSearchProvider;
beforeEach(() => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.upsertNotebook({ id: 'n1', name: 'Work Notes' });
  repo.upsertNotebook({ id: 'n2', name: 'Personal' });
  repo.upsertPage({
    id: 'p1',
    notebookId: 'n1',
    pageNumber: 1,
    writtenAt: '2026-01-01',
    extractedText: 'Acme pricing decision',
    pageType: 'decision',
    openLoop: false,
  });
  repo.upsertPage({
    id: 'p2',
    notebookId: 'n1',
    pageNumber: 2,
    writtenAt: '2026-02-01',
    extractedText: 'Follow up with Acme team',
    pageType: 'meeting_notes',
    openLoop: true,
    openLoopDescription: 'follow up',
  });
  repo.upsertPage({
    id: 'p3',
    notebookId: 'n2',
    pageNumber: 1,
    writtenAt: '2026-03-01',
    extractedText: 'Acme in my personal notebook',
    pageType: 'note',
    openLoop: false,
  });
  provider = new FtsSearchProvider(repo);
});

test('returns matching hits, ranked', () => {
  const hits = provider.search('Acme');
  expect(hits.map((h) => h.pageId).sort()).toEqual(['p1', 'p2', 'p3']);
});

test('empty / whitespace query returns no hits', () => {
  expect(provider.search('')).toEqual([]);
  expect(provider.search('   ')).toEqual([]);
});

test('does not throw on FTS operator characters', () => {
  expect(() => provider.search('Acme: pricing*')).not.toThrow();
});

test('notebook filter restricts to one notebook by display name', () => {
  const hits = provider.search('Acme', { notebook: 'Personal' });
  expect(hits.map((h) => h.pageId)).toEqual(['p3']);
});

test('type filter restricts to a page type', () => {
  const hits = provider.search('Acme', { type: 'decision' });
  expect(hits.map((h) => h.pageId)).toEqual(['p1']);
});

test('openLoop filter keeps only open-loop pages', () => {
  const hits = provider.search('Acme', { openLoop: true });
  expect(hits.map((h) => h.pageId)).toEqual(['p2']);
});

test('combined filters intersect', () => {
  expect(provider.search('Acme', { notebook: 'Work Notes', type: 'decision' }).map((h) => h.pageId)).toEqual([
    'p1',
  ]);
  expect(provider.search('Acme', { notebook: 'Work Notes', openLoop: true }).map((h) => h.pageId)).toEqual([
    'p2',
  ]);
});
