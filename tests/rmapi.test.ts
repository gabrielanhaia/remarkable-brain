import { expect, test } from 'vitest';
import { parseFindPaths, parseStatJson, nameMatchedPaths } from '../src/sync/rmapi.js';

test('parseFindPaths keeps files, drops directories/root/blanks', () => {
  const stdout = ['/', '/Work Notes', '/German/', '/German/verbs', '/trash/Old', ''].join('\n');
  expect(parseFindPaths(stdout)).toEqual(['/Work Notes', '/German/verbs', '/trash/Old']);
});

test('nameMatchedPaths matches #brain in the basename only', () => {
  const all = ['/Ordio #brain', '/Work/Plan #Brain', '/Brainstorming', '/Notes'];
  expect(nameMatchedPaths(all)).toEqual(['/Ordio #brain', '/Work/Plan #Brain']);
});

test('parseStatJson maps metadata and normalizes tags', () => {
  const stdout = JSON.stringify({
    ID: '06416ad5',
    Name: 'Ordio',
    Version: 3,
    ModifiedClient: '2026-06-29T09:57:21Z',
    Type: 'DocumentType',
    Tags: ['brain', { name: 'work' }],
  });
  expect(parseStatJson(stdout, '/Ordio')).toEqual({
    id: '06416ad5',
    name: 'Ordio',
    version: '3',
    modified: '2026-06-29T09:57:21Z',
    tags: ['brain', 'work'],
    path: '/Ordio',
    type: 'DocumentType',
  });
});

test('parseStatJson tolerates empty tags and malformed input', () => {
  const doc = parseStatJson(JSON.stringify({ ID: 'x', Name: 'N', Type: 'DocumentType' }), '/N');
  expect(doc?.tags).toEqual([]);
  expect(parseStatJson('not json', '/N')).toBeNull();
});
