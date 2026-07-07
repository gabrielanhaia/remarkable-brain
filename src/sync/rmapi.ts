import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

export interface RmDoc {
  id: string;
  name: string;
  version: string;
  modified: string;
  tags: string[];
}
export interface Rmapi {
  listDocuments(): Promise<RmDoc[]>;
  exportAnnotatedPdf(id: string, outPath: string): Promise<void>;
}

export function parseLsJson(stdout: string): RmDoc[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((d: any) => ({
    id: String(d.ID ?? d.id ?? ''),
    name: String(d.VisibleName ?? d.name ?? ''),
    version: String(d.Version ?? d.version ?? ''),
    modified: String(d.ModifiedClient ?? d.Modified ?? d.modified ?? ''),
    tags: Array.isArray(d.Tags ?? d.tags) ? (d.Tags ?? d.tags).map(String) : [],
  }));
}

export function createRmapi(bin: string): Rmapi {
  return {
    async listDocuments(): Promise<RmDoc[]> {
      // `rmapi --json ls -l` style output; adapt the flag if the installed rmapi differs.
      const { stdout } = await pexec(bin, ['--json', 'ls', '-l'], { maxBuffer: 1024 * 1024 * 16 });
      return parseLsJson(stdout);
    },
    async exportAnnotatedPdf(id: string, outPath: string): Promise<void> {
      // `geta` downloads the annotated PDF rendered by the reMarkable cloud.
      await pexec(bin, ['geta', '-o', outPath, id], { maxBuffer: 1024 * 1024 * 64 });
    },
  };
}
