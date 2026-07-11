import { homedir } from 'node:os';
import { join } from 'node:path';
import { readStore } from './store.js';
import { DEFAULT_EMBED_MODEL } from './search/embedder.js';

/** Documents inside this reMarkable folder (recursively) are the ones we index. */
export const DEFAULT_BRAIN_FOLDER = '/Brain';
export const HARD_EXCLUDE_PATTERNS: RegExp[] = [/^\./, /private/i, /noindex/i];

export interface Config {
  home: string;
  dbPath: string;
  imagesDir: string;
  manifestPath: string;
  rmapiBin: string;
  rmcBin: string;
  rsvgBin: string;
  brainFolder: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  /** 'auto' = use local semantic search when embeddings + the model are available; 'keyword' = never. */
  searchMode: 'auto' | 'keyword';
  /** transformers.js model id for on-device query/page embeddings (semantic search). */
  embedModel: string;
}

/** Normalize a folder to an absolute reMarkable path (leading slash, no trailing slash). */
export function normalizeFolder(folder: string): string {
  const t = folder.trim();
  if (!t || t === '/') return '/';
  const withSlash = t.startsWith('/') ? t : `/${t}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const home = env.RM_BRAIN_HOME?.trim() || join(env.HOME || homedir(), '.rm-brain');
  return {
    home,
    dbPath: join(home, 'db.sqlite'),
    imagesDir: join(home, 'images'),
    manifestPath: join(home, 'manifest.json'),
    rmapiBin: env.RMAPI_BIN?.trim() || 'rmapi',
    rmcBin: env.RMC_BIN?.trim() || 'rmc',
    rsvgBin: env.RSVG_BIN?.trim() || 'rsvg-convert',
    brainFolder: normalizeFolder(env.RM_BRAIN_FOLDER?.trim() || DEFAULT_BRAIN_FOLDER),
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5',
    searchMode: env.RM_BRAIN_SEARCH?.trim() === 'keyword' ? 'keyword' : 'auto',
    embedModel: env.RM_BRAIN_EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL,
  };
}

/**
 * Config with the persisted store merged in. Precedence: env var > stored value > default.
 * Use this everywhere except unit tests that want pure env behavior (they call loadConfig).
 */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const base = loadConfig(env);
  const store = readStore(base.home);
  return {
    ...base,
    brainFolder: normalizeFolder(
      env.RM_BRAIN_FOLDER?.trim() || store.brainFolder || DEFAULT_BRAIN_FOLDER
    ),
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || store.anthropicApiKey || undefined,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || store.anthropicModel || 'claude-sonnet-5',
  };
}

export function isHardExcluded(name: string): boolean {
  return HARD_EXCLUDE_PATTERNS.some((re) => re.test(name));
}

/** Case-insensitive test: is `remotePath` a document inside `folder` (recursively)? */
export function isUnderFolder(remotePath: string, folder: string): boolean {
  const f = normalizeFolder(folder).toLowerCase().replace(/\/+$/, '');
  if (f === '') return true; // folder '/' means "everything" (not recommended, but valid)
  return remotePath.toLowerCase().startsWith(`${f}/`);
}

/**
 * Hard-exclude by full path, not just the document name: a document is skipped when its own name
 * OR any intermediate folder (below `brainFolder`) matches a hard-exclude pattern. This closes the
 * subfolder gap where `/Brain/private/plan` would otherwise be indexed because only the leaf name
 * ("plan") was tested — the `private` folder should exclude everything beneath it.
 */
export function isPathHardExcluded(remotePath: string, brainFolder: string): boolean {
  const f = normalizeFolder(brainFolder).toLowerCase();
  const lower = remotePath.toLowerCase();
  const rel = f !== '' && lower.startsWith(`${f}/`) ? remotePath.slice(f.length + 1) : remotePath;
  return rel
    .split('/')
    .filter(Boolean)
    .some((seg) => isHardExcluded(seg));
}

/**
 * The subfolder a document sits in, relative to the Brain folder — '' when it is directly inside
 * the Brain folder, or e.g. 'Work/Meetings' for `/Brain/Work/Meetings/Standup`. Used to group
 * notebooks by their reMarkable folder in the UI.
 */
export function relativeFolder(remotePath: string, brainFolder: string): string {
  const f = normalizeFolder(brainFolder).toLowerCase();
  const lower = remotePath.toLowerCase();
  const rel =
    f !== '' && lower.startsWith(`${f}/`)
      ? remotePath.slice(f.length + 1)
      : remotePath.replace(/^\/+/, '');
  const segs = rel.split('/').filter(Boolean);
  segs.pop(); // drop the document name → just the folder chain
  return segs.join('/');
}
