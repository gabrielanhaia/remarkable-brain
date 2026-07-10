import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { resolveConfig } from '../config.js';
import { openDb, migrate } from '../storage/db.js';
import { Repo } from '../storage/repo.js';
import { buildApi, type ApiRoute } from './api.js';
import { contentTypeFor, resolveImageFile, resolveSpaDir, resolveStaticFile } from './static.js';

export interface WebServerOptions {
  port?: number;
  host?: string;
  /** Open the default browser at the served URL (default true). */
  open?: boolean;
}

const DEFAULT_PORT = 4123;
const DEFAULT_HOST = '127.0.0.1';

/** Match a request path against a `/a/:b/c` pattern, returning captured params or null. */
function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const pSeg = pattern.split('/').filter(Boolean);
  const uSeg = path.split('/').filter(Boolean);
  if (pSeg.length !== uSeg.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSeg.length; i++) {
    const p = pSeg[i]!;
    const u = uSeg[i]!;
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(u);
    } else if (p !== u) {
      return null;
    }
  }
  return params;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function sendFile(res: ServerResponse, filePath: string, status = 200): void {
  res.writeHead(status, {
    'content-type': contentTypeFor(filePath),
    'content-length': statSync(filePath).size,
  });
  createReadStream(filePath).pipe(res);
}

/** Best-effort open of the default browser; never throws. */
function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* opening the browser is best-effort */
  }
}

/**
 * Build the request handler: routes `GET /api/*` to the API, `GET /images/*` to path-validated
 * page PNGs, and everything else to the prebuilt SPA (with SPA fallback to `index.html`).
 */
export function createRequestHandler(
  routes: ApiRoute[],
  opts: { imagesDir: string; spaDir: string }
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (method !== 'GET' && method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    // 1) JSON API
    if (path === '/api' || path.startsWith('/api/')) {
      for (const route of routes) {
        const params = matchRoute(route.pattern, path);
        if (params) {
          const { status, body } = route.handler({ params, query: url.searchParams });
          sendJson(res, status, body);
          return;
        }
      }
      sendJson(res, 404, { error: 'Unknown API endpoint' });
      return;
    }

    // 2) Scanned page images: /images/:notebookId/:file
    if (path.startsWith('/images/')) {
      const segs = path.slice('/images/'.length).split('/').map(decodeURIComponent);
      const [notebookId, file] = segs;
      if (segs.length !== 2 || !notebookId || !file) {
        sendJson(res, 400, { error: 'Bad image path' });
        return;
      }
      const abs = resolveImageFile(opts.imagesDir, notebookId, file);
      if (!abs) {
        sendJson(res, 404, { error: 'Image not found' });
        return;
      }
      sendFile(res, abs);
      return;
    }

    // 3) SPA static assets, with fallback to index.html for client-side routes.
    const rel = path === '/' ? 'index.html' : path;
    const asset = resolveStaticFile(opts.spaDir, rel);
    if (asset) {
      sendFile(res, asset);
      return;
    }
    const index = join(opts.spaDir, 'index.html');
    const indexAsset = resolveStaticFile(opts.spaDir, 'index.html');
    if (indexAsset) {
      sendFile(res, indexAsset);
      return;
    }
    // No built SPA present (e.g. `npm run build:web` not run). Give a clear hint.
    sendJson(res, 404, {
      error: `SPA not built. Expected ${index}. Run \`npm run build:web\`.`,
    });
  };
}

/**
 * Start the local, read-only web server. Binds 127.0.0.1 by default, serves the API + images +
 * prebuilt SPA, prints the URL, and (unless `open: false`) opens the browser. Returns the running
 * `http.Server` so tests/callers can close it.
 */
export function startWebServer(options: WebServerOptions = {}): Promise<Server> {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const open = options.open ?? true;

  const cfg = resolveConfig();
  mkdirSync(cfg.home, { recursive: true });
  const db = openDb(cfg.dbPath);
  migrate(db);
  const repo = new Repo(db);
  const routes = buildApi(repo, cfg);
  const spaDir = resolveSpaDir();

  const server = createServer(createRequestHandler(routes, { imagesDir: cfg.imagesDir, spaDir }));

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      console.log(`rm-brain web — serving at ${url}  (read-only, local)`);
      if (open) openBrowser(url);
      resolvePromise(server);
    });
  });
}
