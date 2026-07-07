import { expect, test } from 'vitest';
import { runDoctor } from '../src/cli/doctor.js';
import { loadConfig } from '../src/config.js';

test('doctor reports each dependency status', () => {
  const cfg = loadConfig({ RM_BRAIN_HOME: '/tmp/x', ANTHROPIC_API_KEY: 'k' } as NodeJS.ProcessEnv);
  const res = runDoctor(cfg, {
    hasBin: (b: string) => ['rmapi', 'rmc', 'rsvg-convert'].includes(b),
    homeWritable: true,
  });
  const byName = Object.fromEntries(res.map((r) => [r.name, r.ok]));
  expect(byName['rmapi (ddvk sync15)']).toBe(true);
  expect(byName['rmc']).toBe(true);
  expect(byName['rsvg-convert']).toBe(true);
  expect(byName['ANTHROPIC_API_KEY']).toBe(true);
  expect(byName['data home writable']).toBe(true);
});

test('doctor flags missing renderers and api key', () => {
  const cfg = loadConfig({ RM_BRAIN_HOME: '/tmp/x' } as NodeJS.ProcessEnv);
  const res = runDoctor(cfg, { hasBin: () => false, homeWritable: true });
  const byName = Object.fromEntries(res.map((r) => [r.name, r.ok]));
  expect(byName['rmc']).toBe(false);
  expect(byName['rsvg-convert']).toBe(false);
  expect(byName['ANTHROPIC_API_KEY']).toBe(false);
});
