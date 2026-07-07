import { expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStore, writeStore } from '../src/store.js';
import { resolveConfig } from '../src/config.js';

test('store round-trips and merges patches', () => {
  const home = mkdtempSync(join(tmpdir(), 'rmb-store-'));
  expect(readStore(home)).toEqual({});
  writeStore(home, { anthropicApiKey: 'sk-1' });
  writeStore(home, { anthropicModel: 'claude-opus-4-8' });
  expect(readStore(home)).toEqual({ anthropicApiKey: 'sk-1', anthropicModel: 'claude-opus-4-8' });
});

test('resolveConfig: env wins over store, store wins over default', () => {
  const home = mkdtempSync(join(tmpdir(), 'rmb-store-'));
  writeStore(home, { anthropicApiKey: 'stored-key', anthropicModel: 'claude-opus-4-8' });

  const fromStore = resolveConfig({ RM_BRAIN_HOME: home } as NodeJS.ProcessEnv);
  expect(fromStore.anthropicApiKey).toBe('stored-key');
  expect(fromStore.anthropicModel).toBe('claude-opus-4-8');

  const envWins = resolveConfig({
    RM_BRAIN_HOME: home,
    ANTHROPIC_API_KEY: 'env-key',
    ANTHROPIC_MODEL: 'claude-sonnet-5',
  } as NodeJS.ProcessEnv);
  expect(envWins.anthropicApiKey).toBe('env-key');
  expect(envWins.anthropicModel).toBe('claude-sonnet-5');
});
