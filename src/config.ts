import { homedir } from 'node:os';
import { join } from 'node:path';

export const BRAIN_TAG = 'brain';
export const HARD_EXCLUDE_PATTERNS: RegExp[] = [/^\./, /private/i, /noindex/i];

export interface Config {
  home: string;
  dbPath: string;
  imagesDir: string;
  manifestPath: string;
  rmapiBin: string;
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
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5',
  };
}

export function isHardExcluded(name: string): boolean {
  return HARD_EXCLUDE_PATTERNS.some((re) => re.test(name));
}

export function hasBrainTag(tags: string[]): boolean {
  return tags.some((t) => t.replace(/^#/, '').trim().toLowerCase() === BRAIN_TAG);
}
