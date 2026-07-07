import { expect, test } from 'vitest';
import { parsePngList } from '../src/sync/render.js';

test('parsePngList sorts numerically and filters', () => {
  const files = ['page-10.png', 'page-2.png', 'page-1.png', 'notes.txt'];
  expect(parsePngList(files, '/out')).toEqual(['/out/page-1.png', '/out/page-2.png', '/out/page-10.png']);
});
