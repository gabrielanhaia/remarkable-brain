import { beforeEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/storage/db.js';
import { Repo } from '../src/storage/repo.js';
import { buildApi, type ApiRoute } from '../src/web/api.js';
import type { Config } from '../src/config.js';

const IMAGES_DIR = '/data/images';
const config = { imagesDir: IMAGES_DIR } as unknown as Config;

/** Find a handler by its route pattern and invoke it with params/query. */
function call(
  routes: ApiRoute[],
  pattern: string,
  params: Record<string, string> = {},
  query = ''
) {
  const route = routes.find((r) => r.pattern === pattern);
  if (!route) throw new Error(`no route ${pattern}`);
  return route.handler({ params, query: new URLSearchParams(query) });
}

/** A Repo seeded exactly like tests/repo.test.ts, plus a hidden notebook and image paths. */
function seededRepo(): Repo {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.upsertNotebook({ id: 'n1', name: 'Work Notes' });
  repo.upsertNotebook({ id: 'n2', name: 'Secret', excluded: true });
  repo.upsertPage({
    id: 'p1',
    notebookId: 'n1',
    pageNumber: 1,
    writtenAt: '2026-01-01',
    extractedText: 'Acme pricing decision',
    pageType: 'decision',
    openLoop: false,
    imagePath: `${IMAGES_DIR}/n1/page-1.png`,
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
    imagePath: `${IMAGES_DIR}/n1/page-2.png`,
  });
  // A page in an excluded notebook — must never surface.
  repo.upsertPage({
    id: 'p3',
    notebookId: 'n2',
    pageNumber: 1,
    writtenAt: '2026-03-01',
    extractedText: 'Acme hidden secret',
    openLoop: true,
    openLoopDescription: 'hidden loop',
    imagePath: `${IMAGES_DIR}/n2/page-1.png`,
  });
  repo.linkEntities('p1', [{ name: 'Acme', type: 'company' }]);
  repo.linkEntities('p2', [{ name: 'Acme', type: 'company' }]);
  return repo;
}

/** An empty Repo — no notebooks, no pages — to drive the friendly 503 empty-index state. */
function emptyRepo(): Repo {
  const db = new Database(':memory:');
  migrate(db);
  return new Repo(db);
}

let routes: ApiRoute[];
beforeEach(() => {
  routes = buildApi(seededRepo(), config);
});

test('GET /api/overview returns counts, recent open loops and recent pages with imageUrl', () => {
  const res = call(routes, '/api/overview');
  expect(res.status).toBe(200);
  const body = res.body as any;
  expect(body.counts.notebooks).toBe(1); // n2 excluded
  expect(body.counts.pages).toBeGreaterThanOrEqual(2);
  expect(body.counts.openLoops).toBe(1); // only p2 (p3 is in excluded notebook)
  expect(body.counts.entities).toBe(1);
  expect(body.recentOpenLoops[0].pageId).toBe('p2');
  const recent = body.recentPages.find((p: any) => p.id === 'p1');
  expect(recent.imageUrl).toBe('/images/n1/page-1.png');
});

test('GET /api/notebooks excludes hidden notebooks', () => {
  const res = call(routes, '/api/notebooks');
  expect(res.status).toBe(200);
  const body = res.body as any[];
  expect(body.map((n) => n.id)).toEqual(['n1']);
});

test('GET /api/notebooks/:id returns meta + pages with imageUrl', () => {
  const res = call(routes, '/api/notebooks/:id', { id: 'n1' });
  expect(res.status).toBe(200);
  const body = res.body as any;
  expect(body.name).toBe('Work Notes');
  expect(body.pages.map((p: any) => p.id)).toEqual(['p1', 'p2']);
  expect(body.pages[0].imageUrl).toBe('/images/n1/page-1.png');
});

test('GET /api/notebooks/:id is 404 for unknown or excluded notebooks', () => {
  expect(call(routes, '/api/notebooks/:id', { id: 'nope' }).status).toBe(404);
  expect(call(routes, '/api/notebooks/:id', { id: 'n2' }).status).toBe(404);
});

test('GET /api/pages/:id returns the full page + imageUrl', () => {
  const res = call(routes, '/api/pages/:id', { id: 'p1' });
  expect(res.status).toBe(200);
  const body = res.body as any;
  expect(body.extractedText).toContain('Acme');
  expect(body.imageUrl).toBe('/images/n1/page-1.png');
  expect(body.entities[0].name).toBe('Acme');
});

test('GET /api/pages/:id is 404 for a missing page', () => {
  expect(call(routes, '/api/pages/:id', { id: 'missing' }).status).toBe(404);
});

test('GET /api/search returns hits for a query', async () => {
  const res = await call(routes, '/api/search', {}, 'q=Acme');
  expect(res.status).toBe(200);
  const body = res.body as any[];
  expect(body.length).toBe(2); // p1 + p2, excluded p3 filtered by repo
  expect(body[0].notebookName).toBe('Work Notes');
});

test('GET /api/search with an empty query returns an empty 200', async () => {
  const res = await call(routes, '/api/search', {}, 'q=   ');
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('GET /api/search applies the open_loop filter', async () => {
  const res = await call(routes, '/api/search', {}, 'q=Acme&open_loop=1');
  const body = res.body as any[];
  expect(body.map((h) => h.pageId)).toEqual(['p2']);
});

test('GET /api/search applies the type filter', async () => {
  const res = await call(routes, '/api/search', {}, 'q=Acme&type=decision');
  const body = res.body as any[];
  expect(body.map((h) => h.pageId)).toEqual(['p1']);
});

test('GET /api/open-loops returns loops from non-excluded notebooks', () => {
  const res = call(routes, '/api/open-loops');
  expect(res.status).toBe(200);
  const body = res.body as any[];
  expect(body.map((l) => l.pageId)).toEqual(['p2']);
});

test('GET /api/open-loops rejects an invalid limit with 400', () => {
  expect(call(routes, '/api/open-loops', {}, 'limit=0').status).toBe(400);
  expect(call(routes, '/api/open-loops', {}, 'limit=abc').status).toBe(400);
});

test('GET /api/entities lists entities with page counts', () => {
  const res = call(routes, '/api/entities');
  expect(res.status).toBe(200);
  const body = res.body as any[];
  expect(body[0]).toMatchObject({ name: 'Acme', type: 'company', pageCount: 2 });
});

test('GET /api/entities/:name/timeline is chronological', () => {
  const res = call(routes, '/api/entities/:name/timeline', { name: 'Acme' });
  expect(res.status).toBe(200);
  const body = res.body as any[];
  expect(body.map((e) => e.pageId)).toEqual(['p1', 'p2']);
});

test('every endpoint short-circuits to a friendly 503 when the index is empty', async () => {
  const emptyRoutes = buildApi(emptyRepo(), config);
  for (const r of emptyRoutes) {
    const params: Record<string, string> = {};
    if (r.pattern.includes(':id')) params.id = 'x';
    if (r.pattern.includes(':name')) params.name = 'x';
    const res = await r.handler({ params, query: new URLSearchParams('q=x') });
    expect(res.status, r.pattern).toBe(503);
    expect((res.body as any).error).toMatch(/rm-brain sync/);
  }
});
