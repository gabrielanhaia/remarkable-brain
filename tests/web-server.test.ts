import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb, migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';
import { startWebServer } from '../src/web/server.js';

let home: string;
let server: Server;
let base: string;
const savedHome = process.env.RM_BRAIN_HOME;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'rm-brain-web-'));
  process.env.RM_BRAIN_HOME = home;

  // Seed a page so /api/overview has data (and is not the empty-index 503 state).
  const db = openDb(join(home, 'db.sqlite'));
  migrate(db);
  const repo = new Repo(db);
  repo.upsertNotebook({ id: 'n1', name: 'Work Notes' });
  repo.upsertPage({
    id: 'p1',
    notebookId: 'n1',
    pageNumber: 1,
    writtenAt: '2026-01-01',
    extractedText: 'Ordio pricing',
    openLoop: false,
    imagePath: join(home, 'images', 'n1', 'page-1.png'),
  });
  db.close();

  // Ephemeral port (0) bound to loopback, browser suppressed.
  server = await startWebServer({ port: 0, host: '127.0.0.1', open: false });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (savedHome === undefined) delete process.env.RM_BRAIN_HOME;
  else process.env.RM_BRAIN_HOME = savedHome;
  rmSync(home, { recursive: true, force: true });
});

test('binds an ephemeral port and serves GET /api/overview as 200 JSON', async () => {
  const res = await fetch(`${base}/api/overview`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/application\/json/);
  const body = (await res.json()) as any;
  expect(body.counts.notebooks).toBe(1);
  expect(body.counts.pages).toBe(1);
});

test('an unknown API path is 404', async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  expect(res.status).toBe(404);
  const body = (await res.json()) as any;
  expect(body.error).toBeTruthy();
});

test('a non-GET method is rejected with 405', async () => {
  const res = await fetch(`${base}/api/overview`, { method: 'POST' });
  expect(res.status).toBe(405);
});

test('image path traversal is rejected (not served)', async () => {
  // %2E%2E%2F decodes to "../" inside the file segment — the image resolver must reject it.
  const res = await fetch(`${base}/images/n1/%2E%2E%2F%2E%2E%2Fpasswd`);
  expect(res.status).not.toBe(200);
  expect([400, 404]).toContain(res.status);
});
