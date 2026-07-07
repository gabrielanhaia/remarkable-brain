import { expect, test } from 'vitest';
import { runDoctor } from '../src/cli/doctor.js';

test('doctor reports each dependency status', () => {
  const res = runDoctor({ RMAPI_BIN: 'rmapi', ANTHROPIC_API_KEY: 'k' } as NodeJS.ProcessEnv, {
    hasBin: (b: string) => b === 'rmapi' || b === 'pdftoppm',
    homeWritable: true,
  });
  const byName = Object.fromEntries(res.map((r) => [r.name, r.ok]));
  expect(byName['rmapi']).toBe(true);
  expect(byName['poppler (pdftoppm)']).toBe(true);
  expect(byName['ANTHROPIC_API_KEY']).toBe(true);
  expect(byName['data home writable']).toBe(true);
});

test('doctor flags missing api key and poppler', () => {
  const res = runDoctor({ RMAPI_BIN: 'rmapi' } as NodeJS.ProcessEnv, {
    hasBin: () => false,
    homeWritable: true,
  });
  const byName = Object.fromEntries(res.map((r) => [r.name, r.ok]));
  expect(byName['poppler (pdftoppm)']).toBe(false);
  expect(byName['ANTHROPIC_API_KEY']).toBe(false);
});
