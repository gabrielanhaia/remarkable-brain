import { describe, expect, test } from 'vitest';
import { loadConfig, isHardExcluded, hasBrainTag, HARD_EXCLUDE_PATTERNS } from '../src/config.js';

describe('config', () => {
  test('defaults home to ~/.rm-brain and model to sonnet-5', () => {
    const cfg = loadConfig({ HOME: '/home/x' } as NodeJS.ProcessEnv);
    expect(cfg.home).toBe('/home/x/.rm-brain');
    expect(cfg.dbPath).toBe('/home/x/.rm-brain/db.sqlite');
    expect(cfg.imagesDir).toBe('/home/x/.rm-brain/images');
    expect(cfg.manifestPath).toBe('/home/x/.rm-brain/manifest.json');
    expect(cfg.rmapiBin).toBe('rmapi');
    expect(cfg.anthropicModel).toBe('claude-sonnet-5');
  });

  test('env overrides win', () => {
    const cfg = loadConfig({
      RM_BRAIN_HOME: '/data',
      RMAPI_BIN: '/bin/rmapi',
      ANTHROPIC_MODEL: 'claude-opus-4-8',
      ANTHROPIC_API_KEY: 'k',
    } as NodeJS.ProcessEnv);
    expect(cfg.home).toBe('/data');
    expect(cfg.rmapiBin).toBe('/bin/rmapi');
    expect(cfg.anthropicModel).toBe('claude-opus-4-8');
    expect(cfg.anthropicApiKey).toBe('k');
  });

  test('hard exclusion matches dotfiles, private, noindex (case-insensitive)', () => {
    expect(isHardExcluded('.Secret')).toBe(true);
    expect(isHardExcluded('My Private Journal')).toBe(true);
    expect(isHardExcluded('Work noindex')).toBe(true);
    expect(isHardExcluded('Work Notes')).toBe(false);
    expect(HARD_EXCLUDE_PATTERNS.length).toBe(3);
  });

  test('brain tag matches with or without leading #, case-insensitive', () => {
    expect(hasBrainTag(['brain'])).toBe(true);
    expect(hasBrainTag(['#Brain'])).toBe(true);
    expect(hasBrainTag(['todo', 'work'])).toBe(false);
    expect(hasBrainTag([])).toBe(false);
  });
});
