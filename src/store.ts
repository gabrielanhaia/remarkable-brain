import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Small persisted config so users don't re-export secrets every session.
 * Lives at `<home>/config.json`, chmod 600 (it can hold the API key).
 * Environment variables always take precedence over stored values.
 */
export interface StoredConfig {
  anthropicApiKey?: string;
  anthropicModel?: string;
  brainFolder?: string;
}

export function storePath(home: string): string {
  return join(home, 'config.json');
}

export function readStore(home: string): StoredConfig {
  const p = storePath(home);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as StoredConfig;
  } catch {
    return {};
  }
}

export function writeStore(home: string, patch: StoredConfig): StoredConfig {
  const merged = { ...readStore(home), ...patch };
  mkdirSync(home, { recursive: true });
  const p = storePath(home);
  writeFileSync(p, JSON.stringify(merged, null, 2));
  try {
    chmodSync(p, 0o600);
  } catch {
    // best-effort on platforms without POSIX perms
  }
  return merged;
}
