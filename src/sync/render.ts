import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

export interface RenderedPage {
  pageNumber: number;
  path: string;
}
export interface Renderer {
  /** Render each drawn page of a `.rmdoc` to a PNG, in notebook order. Blank pages are skipped. */
  renderDocToPngs(rmdocPath: string, outDir: string, docId: string): Promise<RenderedPage[]>;
}

/** Extract the ordered list of page ids from a `.content` file (formatVersion 2 `cPages`, or legacy `pages`). */
export function parsePageOrder(contentJson: string): string[] {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(contentJson) as Record<string, unknown>;
  } catch {
    return [];
  }
  const cPages = d.cPages as { pages?: { id?: string }[] } | undefined;
  if (cPages?.pages) {
    return cPages.pages.map((p) => String(p.id ?? '')).filter((id) => id.length > 0);
  }
  if (Array.isArray(d.pages)) {
    return (d.pages as unknown[]).map((p) => String(p)).filter((id) => id.length > 0);
  }
  return [];
}

export function createRenderer(rmcBin = 'rmc', rsvgBin = 'rsvg-convert'): Renderer {
  return {
    async renderDocToPngs(rmdocPath: string, outDir: string, docId: string): Promise<RenderedPage[]> {
      const work = mkdtempSync(join(tmpdir(), 'rmb-render-'));
      await pexec('unzip', ['-o', '-q', rmdocPath, '-d', work], { maxBuffer: 1024 * 1024 * 256 });

      const contentFile = readdirSync(work).find((f) => f.endsWith('.content'));
      if (!contentFile) throw new Error(`no .content file in ${rmdocPath}`);
      const innerId = basename(contentFile, '.content');
      const order = parsePageOrder(readFileSync(join(work, contentFile), 'utf8'));
      const pageDir = join(work, innerId);

      const destDir = join(outDir, docId);
      mkdirSync(destDir, { recursive: true });

      const out: RenderedPage[] = [];
      let pageNumber = 0;
      for (const pageId of order) {
        pageNumber++;
        const rm = join(pageDir, `${pageId}.rm`);
        if (!existsSync(rm)) continue; // page never drawn on — nothing to transcribe
        const svg = join(work, `${pageId}.svg`);
        const png = join(destDir, `page-${pageNumber}.png`);
        await pexec(rmcBin, ['-t', 'svg', rm, '-o', svg], { maxBuffer: 1024 * 1024 * 64 });
        await pexec(rsvgBin, ['-b', 'white', svg, '-o', png], { maxBuffer: 1024 * 1024 * 64 });
        out.push({ pageNumber, path: png });
      }
      return out;
    },
  };
}
