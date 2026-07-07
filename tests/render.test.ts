import { expect, test } from 'vitest';
import { parsePageOrder } from '../src/sync/render.js';

test('parsePageOrder reads cPages.pages order (formatVersion 2)', () => {
  const content = JSON.stringify({
    formatVersion: 2,
    cPages: { pages: [{ id: 'aaa' }, { id: 'bbb' }, { id: 'ccc' }] },
  });
  expect(parsePageOrder(content)).toEqual(['aaa', 'bbb', 'ccc']);
});

test('parsePageOrder falls back to legacy pages array', () => {
  expect(parsePageOrder(JSON.stringify({ pages: ['p1', 'p2'] }))).toEqual(['p1', 'p2']);
});

test('parsePageOrder returns [] on malformed input', () => {
  expect(parsePageOrder('not json')).toEqual([]);
  expect(parsePageOrder('{}')).toEqual([]);
});
