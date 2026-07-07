import { beforeEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';
import { buildToolHandlers } from '../src/mcp/tools.js';

let handlers: ReturnType<typeof buildToolHandlers>;
beforeEach(() => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.upsertNotebook({ id: 'n1', name: 'Work' });
  repo.upsertPage({
    id: 'p1',
    notebookId: 'n1',
    pageNumber: 1,
    writtenAt: '2026-01-01',
    extractedText: 'Acme pricing',
    openLoop: true,
    openLoopDescription: 'decide price',
    imagePath: '/i/p1.png',
  });
  repo.linkEntities('p1', [{ name: 'Acme', type: 'company' }]);
  handlers = buildToolHandlers(repo);
});

test('search_notes returns receipts', () => {
  const r = handlers.search_notes({ query: 'Acme' });
  expect(r.results[0]).toMatchObject({ notebookName: 'Work', pageNumber: 1 });
});
test('get_open_loops works', () => {
  const r = handlers.get_open_loops({});
  expect((r.results[0] as any).pageId).toBe('p1');
});
test('get_entity_timeline works', () => {
  expect(handlers.get_entity_timeline({ entity_name: 'Acme' }).results.length).toBe(1);
});
test('get_page returns image path + text', () => {
  const r = handlers.get_page({ page_id: 'p1' }) as any;
  expect(r.imagePath).toBe('/i/p1.png');
  expect(r.extractedText).toContain('Acme');
});
