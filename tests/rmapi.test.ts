import { expect, test } from 'vitest';
import { parseLsJson } from '../src/sync/rmapi.js';

test('parseLsJson extracts id, name, version, modified, tags', () => {
  const stdout = JSON.stringify([
    { ID: 'abc', VisibleName: 'Work Notes', Version: '7', ModifiedClient: '2026-01-01T00:00:00Z', Tags: ['brain'] },
    { ID: 'def', VisibleName: 'Groceries', Version: '2' },
  ]);
  const docs = parseLsJson(stdout);
  expect(docs).toEqual([
    { id: 'abc', name: 'Work Notes', version: '7', modified: '2026-01-01T00:00:00Z', tags: ['brain'] },
    { id: 'def', name: 'Groceries', version: '2', modified: '', tags: [] },
  ]);
});

test('parseLsJson tolerates empty / malformed input', () => {
  expect(parseLsJson('')).toEqual([]);
  expect(parseLsJson('not json')).toEqual([]);
});
