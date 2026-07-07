import { describe, expect, test } from 'vitest';
import {
  loadConfig,
  isHardExcluded,
  isUnderFolder,
  normalizeFolder,
  HARD_EXCLUDE_PATTERNS,
} from '../src/config.js';

describe('config', () => {
  test('defaults home to ~/.rm-brain, folder to /Brain, model to sonnet-5', () => {
    const cfg = loadConfig({ HOME: '/home/x' } as NodeJS.ProcessEnv);
    expect(cfg.home).toBe('/home/x/.rm-brain');
    expect(cfg.dbPath).toBe('/home/x/.rm-brain/db.sqlite');
    expect(cfg.brainFolder).toBe('/Brain');
    expect(cfg.rmapiBin).toBe('rmapi');
    expect(cfg.anthropicModel).toBe('claude-sonnet-5');
  });

  test('env overrides win, folder is normalized', () => {
    const cfg = loadConfig({
      RM_BRAIN_HOME: '/data',
      RM_BRAIN_FOLDER: 'brain',
      ANTHROPIC_MODEL: 'claude-opus-4-8',
      ANTHROPIC_API_KEY: 'k',
    } as NodeJS.ProcessEnv);
    expect(cfg.home).toBe('/data');
    expect(cfg.brainFolder).toBe('/brain');
    expect(cfg.anthropicModel).toBe('claude-opus-4-8');
    expect(cfg.anthropicApiKey).toBe('k');
  });

  test('normalizeFolder adds leading slash and trims trailing', () => {
    expect(normalizeFolder('Brain')).toBe('/Brain');
    expect(normalizeFolder('/Brain/')).toBe('/Brain');
    expect(normalizeFolder('  notes/second  ')).toBe('/notes/second');
    expect(normalizeFolder('/')).toBe('/');
  });

  test('hard exclusion matches dotfiles, private, noindex (case-insensitive)', () => {
    expect(isHardExcluded('.Secret')).toBe(true);
    expect(isHardExcluded('My Private Journal')).toBe(true);
    expect(isHardExcluded('Work noindex')).toBe(true);
    expect(isHardExcluded('Work Notes')).toBe(false);
    expect(HARD_EXCLUDE_PATTERNS.length).toBe(3);
  });

  test('isUnderFolder is case-insensitive and recursive, files only', () => {
    expect(isUnderFolder('/Brain/Acme', '/Brain')).toBe(true);
    expect(isUnderFolder('/brain/Acme', 'Brain')).toBe(true); // case-insensitive
    expect(isUnderFolder('/Brain/sub/Deep', '/Brain')).toBe(true); // recursive
    expect(isUnderFolder('/Other/Acme', '/Brain')).toBe(false);
    expect(isUnderFolder('/Brainstorming/x', '/Brain')).toBe(false); // not a prefix segment
  });
});
