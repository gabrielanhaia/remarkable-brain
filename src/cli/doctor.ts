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
    { name: 'rmapi (ddvk sync15)', ok: checks.hasBin(cfg.rmapiBin), detail: cfg.rmapiBin },
    { name: 'rmc', ok: checks.hasBin(cfg.rmcBin), detail: 'pipx install rmc' },
    { name: 'rsvg-convert', ok: checks.hasBin(cfg.rsvgBin), detail: 'brew install librsvg' },
    {
      name: 'ANTHROPIC_API_KEY',
      ok: !!cfg.anthropicApiKey,
      detail: cfg.anthropicApiKey ? 'set' : 'missing (needed for sync)',
    },
    { name: 'data home writable', ok: checks.homeWritable, detail: cfg.home },
  ];
}
