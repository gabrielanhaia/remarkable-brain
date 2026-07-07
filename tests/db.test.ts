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
