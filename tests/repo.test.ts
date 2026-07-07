import { beforeEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/storage/db.js';
import { Repo, toFtsQuery } from '../src/storage/repo.js';

test('toFtsQuery quotes tokens and drops FTS operator characters', () => {
  expect(toFtsQuery('08/07')).toBe('"08" "07"');
  expect(toFtsQuery('Alex: pricing*')).toBe('"Alex" "pricing"');
  expect(toFtsQuery('   ')).toBe('');
});

let repo: Repo;
beforeEach(() => {
  const db = new Database(':memory:');
  migrate(db);
  repo = new Repo(db);
  repo.upsertNotebook({ id: 'n1', name: 'Work Notes' });
  repo.upsertPage({
    id: 'p1',
    notebookId: 'n1',
    pageNumber: 1,
    writtenAt: '2026-01-01',
    extractedText: 'Acme pricing decision',
    pageType: 'decision',
    openLoop: false,
    imagePath: '/img/p1.png',
  });
  repo.upsertPage({
    id: 'p2',
    notebookId: 'n1',
    pageNumber: 2,
    writtenAt: '2026-02-01',
    extractedText: 'Follow up with Acme team',
    pageType: 'meeting_notes',
    openLoop: true,
    openLoopDescription: 'follow up with Acme',
    imagePath: '/img/p2.png',
  });
  repo.linkEntities('p1', [{ name: 'Acme', type: 'company' }]);
  repo.linkEntities('p2', [{ name: 'Acme', type: 'company' }]);
});

test('searchNotes returns receipts', () => {
  const hits = repo.searchNotes('Acme');
  expect(hits.length).toBe(2);
  expect(hits[0]).toHaveProperty('notebookName', 'Work Notes');
  expect(hits[0]).toHaveProperty('pageNumber');
});

test('searchNotes does not crash on FTS operator characters', () => {
  repo.upsertPage({ id: 'p3', notebookId: 'n1', pageNumber: 3, extractedText: '08/07 buy rice', openLoop: true });
  expect(() => repo.searchNotes('08/07')).not.toThrow();
  expect(repo.searchNotes('08/07').length).toBe(1);
  expect(repo.searchNotes('   ')).toEqual([]);
});

test('getEntityTimeline is chronological', () => {
  const t = repo.getEntityTimeline('Acme');
  expect(t.map((x) => x.pageId)).toEqual(['p1', 'p2']);
});

test('getOpenLoops most recent first', () => {
  const loops = repo.getOpenLoops();
  expect(loops.length).toBe(1);
  expect(loops[0]!.pageId).toBe('p2');
});

test('upsertPage replaces text and updates FTS', () => {
  repo.upsertPage({
    id: 'p1',
    notebookId: 'n1',
    pageNumber: 1,
    extractedText: 'totally new content',
    openLoop: false,
  });
  expect(repo.searchNotes('pricing').length).toBe(0);
  expect(repo.searchNotes('totally').length).toBe(1);
});

test('excluded notebooks are hidden from search and tracked by id', () => {
  repo.setExcluded('n1', true);
  expect(repo.searchNotes('Acme').length).toBe(0);
  expect(repo.listExcludedIds()).toEqual(['n1']);
  // a routine re-upsert (as sync would do) must not clear the exclusion
  repo.upsertNotebook({ id: 'n1', name: 'Work Notes' });
  expect(repo.listExcludedIds()).toEqual(['n1']);
});

test('purgeNotebook returns image paths and removes rows', () => {
  const imgs = repo.purgeNotebook('n1');
  expect(imgs.sort()).toEqual(['/img/p1.png', '/img/p2.png']);
  expect(repo.searchNotes('Acme').length).toBe(0);
  expect(repo.listNotebooks().length).toBe(0);
});
