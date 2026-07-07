import { expect, test } from 'vitest';
import {
  hashBuffer,
  docChanged,
  pageChanged,
  recordPage,
  loadManifest,
  saveManifest,
  type Manifest,
} from '../src/sync/manifest.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('hashBuffer is stable and content-sensitive', () => {
  expect(hashBuffer(Buffer.from('a'))).toBe(hashBuffer(Buffer.from('a')));
  expect(hashBuffer(Buffer.from('a'))).not.toBe(hashBuffer(Buffer.from('b')));
});

test('doc/page change detection', () => {
  const m: Manifest = { docs: {} };
  expect(docChanged(m, 'd1', 'v1')).toBe(true);
  recordPage(m, 'd1', 'v1', 1, 'h1');
  expect(docChanged(m, 'd1', 'v1')).toBe(false);
  expect(docChanged(m, 'd1', 'v2')).toBe(true);
  expect(pageChanged(m, 'd1', 1, 'h1')).toBe(false);
  expect(pageChanged(m, 'd1', 1, 'h2')).toBe(true);
  expect(pageChanged(m, 'd1', 2, 'hx')).toBe(true);
});

test('load returns empty manifest when file missing; save/load round-trips', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rmb-'));
  const p = join(dir, 'manifest.json');
  expect(loadManifest(p)).toEqual({ docs: {} });
  const m: Manifest = { docs: {} };
  recordPage(m, 'd1', 'v1', 1, 'h1');
  saveManifest(p, m);
  expect(loadManifest(p)).toEqual(m);
});
