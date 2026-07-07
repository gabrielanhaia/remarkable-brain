import { expect, test } from 'vitest';
import { runDoctor } from '../src/cli/doctor.js';

test('doctor reports each dependency status', () => {
  const res = runDoctor({ RMAPI_BIN: 'rmapi', ANTHROPIC_API_KEY: 'k' } as NodeJS.ProcessEnv, {
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
  const res = runDoctor({ RMAPI_BIN: 'rmapi' } as NodeJS.ProcessEnv, {
    hasBin: () => false,
    homeWritable: true,
  });
  const byName = Object.fromEntries(res.map((r) => [r.name, r.ok]));
  expect(byName['rmc']).toBe(false);
  expect(byName['rsvg-convert']).toBe(false);
  expect(byName['ANTHROPIC_API_KEY']).toBe(false);
});
