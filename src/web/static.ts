import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';

/**
 * Resolve the built SPA directory (`web/dist`) robustly, regardless of whether the code runs from
 * the TS source (`src/web/`), the bundled output (`dist/`), or an installed npm package. We walk
 * upward from this module looking for a `web/dist/index.html`, then fall back to the package root.
 */
export function resolveSpaDir(fromUrl: string = import.meta.url): string {
  const here = dirname(fileURLToPath(fromUrl));
  const candidates: string[] = [];
  let dir = here;
  // Walk up a bounded number of levels collecting `<dir>/web/dist` candidates.
  for (let i = 0; i < 6; i++) {
    candidates.push(join(dir, 'web', 'dist'));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const c of candidates) {
    if (existsSync(join(c, 'index.html'))) return c;
  }
  // Fall back to the first candidate so callers get a sensible (if not-yet-built) path.
  return candidates[0] ?? join(here, 'web', 'dist');
}

/** The MIME type for a static asset, by extension. Small table — the SPA ships a fixed set. */
export function contentTypeFor(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  const map: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * Safely resolve a static asset request to an absolute path INSIDE `rootDir`, or `null` if the
 * request would escape it (path traversal) or the file does not exist. `relPath` is the URL path
 * relative to the SPA root (already URL-decoded, no query string).
 */
export function resolveStaticFile(rootDir: string, relPath: string): string | null {
  return safeJoin(rootDir, relPath);
}

/**
 * Safely resolve `/images/:notebookId/:file` to an absolute path inside `imagesDir`. Returns the
 * on-disk path only if it stays within `imagesDir` and exists; otherwise `null`. Strict path
 * validation prevents traversal (`..`, absolute segments, symlink-y tricks) outside the images
 * root — the localhost server must never read files outside `RM_BRAIN_HOME/images`.
 */
export function resolveImageFile(imagesDir: string, notebookId: string, file: string): string | null {
  // Reject any segment that isn't a plain name — no separators, no traversal, no NUL.
  for (const seg of [notebookId, file]) {
    if (!seg || seg.includes('/') || seg.includes('\\') || seg.includes('\0') || seg === '..' || seg === '.') {
      return null;
    }
  }
  return safeJoin(imagesDir, join(notebookId, file));
}

/**
 * Convert an absolute on-disk `imagePath` (as stored on page rows) into a browser URL under
 * `/images/...`, or `null` if the path is missing or lies outside `imagesDir`. Mirrors the layout
 * written by sync: `<imagesDir>/<notebookId>/page-<n>.png`.
 */
export function imageUrlFromPath(imagePath: string | null | undefined, imagesDir: string): string | null {
  if (!imagePath) return null;
  const rel = relative(resolve(imagesDir), resolve(imagePath));
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(imagePath).length < resolve(imagesDir).length) {
    return null;
  }
  return `/images/${rel.split(sep).map(encodeURIComponent).join('/')}`;
}

/**
 * Join `rootDir` + `relPath`, normalize, and confirm the result stays within `rootDir` and exists.
 * Shared traversal guard used by both static-asset and image resolution.
 */
function safeJoin(rootDir: string, relPath: string): string | null {
  const root = resolve(rootDir);
  // Strip leading slashes so `relPath` is always treated as relative to root.
  const cleaned = normalize(relPath).replace(/^([/\\])+/, '');
  const target = resolve(root, cleaned);
  const rel = relative(root, target);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) return null;
  if (!existsSync(target)) return null;
  return target;
}
