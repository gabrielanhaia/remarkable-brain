import { loadConfig } from '../config.js';

export interface DoctorResult {
  name: string;
  ok: boolean;
  detail: string;
}
export interface DoctorChecks {
  hasBin: (bin: string) => boolean;
  homeWritable: boolean;
}

export function runDoctor(env: NodeJS.ProcessEnv, checks: DoctorChecks): DoctorResult[] {
  const cfg = loadConfig(env);
  return [
    { name: 'rmapi', ok: checks.hasBin(cfg.rmapiBin), detail: cfg.rmapiBin },
    { name: 'poppler (pdftoppm)', ok: checks.hasBin('pdftoppm'), detail: 'brew install poppler' },
    {
      name: 'ANTHROPIC_API_KEY',
      ok: !!cfg.anthropicApiKey,
      detail: cfg.anthropicApiKey ? 'set' : 'missing (needed for sync)',
    },
    { name: 'data home writable', ok: checks.homeWritable, detail: cfg.home },
  ];
}
