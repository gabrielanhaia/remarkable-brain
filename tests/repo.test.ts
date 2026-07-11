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

test('searchNotes matches partial words via prefix', () => {
  expect(repo.searchNotes('Acm').length).toBe(2); // "Acm" → Acme on both pages
  expect(repo.searchNotes('pric').length).toBe(1); // "pric" → pricing on p1
});

test('searchNotes matches word forms via stemming (both directions)', () => {
  repo.upsertPage({
    id: 'p9', notebookId: 'n1', pageNumber: 9,
    extractedText: 'Weekly meetings about running the release', openLoop: false,
  });
  expect(repo.searchNotes('meeting').map((h) => h.pageId)).toContain('p9'); // meeting → meetings
  expect(repo.searchNotes('run').map((h) => h.pageId)).toContain('p9'); // run → running
  expect(repo.searchNotes('releases').map((h) => h.pageId)).toContain('p9'); // releases → release
});

test('searchNotes tolerates spelling mistakes via a fuzzy fallback', () => {
  expect(repo.searchNotes('Acne').length).toBe(2); // typo for "Acme" (edit distance 1)
  expect(repo.searchNotes('pricign').length).toBe(1); // transposition of "pricing"
  expect(repo.searchNotes('zzzzz').length).toBe(0); // nothing close → still empty
});

test('getEntityTimeline is chronological', () => {
  const t = repo.getEntityTimeline('Acme');
  expect(t.map((x) => x.pageId)).toEqual(['p1', 'p2']);
});

test('getEntityTimeline lists each page once even when a name has multiple type-variants', () => {
  // Same page linked to the same name under two synonymous types (pre-normalization data).
  repo.linkEntities('p1', [
    { name: 'Zephyr', type: 'place' },
    { name: 'Zephyr', type: 'location' },
  ]);
  const t = repo.getEntityTimeline('Zephyr');
  expect(t.length).toBe(1); // one page, not two
  expect(t[0]!.pageId).toBe('p1');
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

test('listEntities collapses one name tagged with different types into a single entry', () => {
  // The same real thing extracted as two synonymous types across two pages.
  repo.linkEntities('p1', [{ name: 'Lisbon', type: 'place' }]);
  repo.linkEntities('p2', [{ name: 'Lisbon', type: 'location' }]); // pre-normalization-style dup
  const list = repo.listEntities();
  const lisbon = list.filter((e) => e.name === 'Lisbon');
  expect(lisbon.length).toBe(1); // one card, not two
  expect(lisbon[0]!.pageCount).toBe(2); // both pages counted
});

test('getPage de-duplicates a page\'s entities by name', () => {
  // Same real entity linked to this page under two synonymous types (pre-normalization data).
  repo.linkEntities('p1', [
    { name: 'Zephyr', type: 'place' },
    { name: 'Zephyr', type: 'location' },
  ]);
  const zephyr = repo.getPage('p1')!.entities.filter((e) => e.name === 'Zephyr');
  expect(zephyr.length).toBe(1); // one chip, not two
});

test('linkEntities replaces a page\'s links instead of accumulating them', () => {
  // p1 starts linked to Acme (from beforeEach). Re-extraction now finds Beta instead.
  repo.linkEntities('p1', [{ name: 'Beta', type: 'company' }]);
  expect(repo.getPage('p1')!.entities).toEqual([{ name: 'Beta', type: 'company' }]);
  // Acme must no longer point at p1 (only p2 still mentions it).
  expect(repo.getEntityTimeline('Acme').map((x) => x.pageId)).toEqual(['p2']);
});

test('prunePagesNotIn deletes pages absent from the keep set and returns their images', () => {
  const removed = repo.prunePagesNotIn('n1', [1]); // keep page 1, drop page 2
  expect(removed).toEqual(['/img/p2.png']);
  expect(repo.listNotebookPages('n1').map((p) => p.pageNumber)).toEqual([1]);
  expect(repo.searchNotes('Follow').length).toBe(0); // p2's text gone from FTS too
});

test('prunePagesNotIn with an empty keep set deletes every page', () => {
  const removed = repo.prunePagesNotIn('n1', []);
  expect(removed.sort()).toEqual(['/img/p1.png', '/img/p2.png']);
  expect(repo.listNotebookPages('n1').length).toBe(0);
});

test('purgeNotebook returns image paths and removes rows', () => {
  const imgs = repo.purgeNotebook('n1');
  expect(imgs.sort()).toEqual(['/img/p1.png', '/img/p2.png']);
  expect(repo.searchNotes('Acme').length).toBe(0);
  expect(repo.listNotebooks().length).toBe(0);
});
