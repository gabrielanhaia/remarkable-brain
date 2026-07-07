import { homedir } from 'node:os';
import { join } from 'node:path';
import { readStore } from './store.js';

export const BRAIN_TAG = 'brain';
export const HARD_EXCLUDE_PATTERNS: RegExp[] = [/^\./, /private/i, /noindex/i];

export interface Config {
  home: string;
  dbPath: string;
  imagesDir: string;
  manifestPath: string;
  rmapiBin: string;
  rmcBin: string;
  rsvgBin: string;
  anthropicApiKey?: string;
  anthropicModel: string;
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
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5',
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
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || store.anthropicApiKey || undefined,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || store.anthropicModel || 'claude-sonnet-5',
  };
}

export function isHardExcluded(name: string): boolean {
  return HARD_EXCLUDE_PATTERNS.some((re) => re.test(name));
}

export function hasBrainTag(tags: string[]): boolean {
  return tags.some((t) => t.replace(/^#/, '').trim().toLowerCase() === BRAIN_TAG);
}

/** Name-based opt-in: an explicit `#brain` token in the title (not just any word containing "brain"). */
export function nameHasBrainOptIn(name: string): boolean {
  return /#brain\b/i.test(name);
}

/** A document is opted in if it carries the `brain` tag OR has `#brain` in its title. */
export function isOptedIn(name: string, tags: string[]): boolean {
  return hasBrainTag(tags) || nameHasBrainOptIn(name);
}
