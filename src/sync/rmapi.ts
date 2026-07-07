import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isUnderFolder } from '../config.js';
const pexec = promisify(execFile);

export interface RmDoc {
  id: string;
  name: string;
  version: string;
  modified: string;
  tags: string[];
  path: string;
  type: string;
}
export interface Rmapi {
  /** All documents inside `folder` (recursively, case-insensitive), excluding trash. */
  listFolderDocs(folder: string): Promise<RmDoc[]>;
  /** Download a document to destDir; returns the path to the produced `.rmdoc` archive. */
  downloadDoc(remotePath: string, destDir: string): Promise<string>;
}

/** Parse `rmapi find --compact` output: one path per line; directories end with '/'. */
export function parseFindPaths(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '/' && !s.endsWith('/'));
}

/** Parse `rmapi stat <path>` JSON metadata into an RmDoc (tags normalized to plain strings). */
export function parseStatJson(stdout: string, remotePath: string): RmDoc | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!d || !d.ID) return null;
  const rawTags = Array.isArray(d.Tags) ? (d.Tags as unknown[]) : [];
  const tags = rawTags
    .map((t) =>
      typeof t === 'string' ? t : String((t as Record<string, unknown>)?.name ?? '')
    )
    .filter((t) => t.length > 0);
  return {
    id: String(d.ID),
    name: String(d.Name ?? ''),
    version: String(d.Version ?? ''),
    modified: String(d.ModifiedClient ?? d.Modified ?? ''),
    tags,
    path: remotePath,
    type: String(d.Type ?? ''),
  };
}

export function createRmapi(bin: string): Rmapi {
  const run = (args: string[], opts: { cwd?: string } = {}) =>
    pexec(bin, ['-ni', ...args], { maxBuffer: 1024 * 1024 * 128, cwd: opts.cwd });

  return {
    async listFolderDocs(folder: string): Promise<RmDoc[]> {
      const { stdout } = await run(['find', '--compact', '/']);
      const paths = parseFindPaths(stdout).filter(
        (p) => !p.startsWith('/trash/') && isUnderFolder(p, folder)
      );
      const docs: RmDoc[] = [];
      for (const p of paths) {
        try {
          const { stdout: s } = await run(['stat', p]);
          const doc = parseStatJson(s, p);
          if (doc && doc.type === 'DocumentType') docs.push(doc);
        } catch {
          // a single unreadable entry shouldn't abort the whole listing
        }
      }
      return docs;
    },

    async downloadDoc(remotePath: string, destDir: string): Promise<string> {
      await run(['get', remotePath], { cwd: destDir });
      const archive = readdirSync(destDir).find(
        (f) => f.endsWith('.rmdoc') || f.endsWith('.zip')
      );
      if (!archive) throw new Error(`rmapi get produced no archive for ${remotePath}`);
      return join(destDir, archive);
    },
  };
}
