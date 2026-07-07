import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const pexec = promisify(execFile);

export interface Renderer {
  renderPdfToPngs(pdfPath: string, outDir: string, docId: string): Promise<string[]>;
}

export function parsePngList(files: string[], outDir: string): string[] {
  return files
    .filter((f) => /^page-\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    .map((f) => join(outDir, f));
}

export function createRenderer(pdftoppmBin = 'pdftoppm'): Renderer {
  return {
    async renderPdfToPngs(pdfPath: string, outDir: string, docId: string): Promise<string[]> {
      const dir = join(outDir, docId);
      mkdirSync(dir, { recursive: true });
      // -r 150 dpi, -png; produces page-1.png, page-2.png, ...
      await pexec(pdftoppmBin, ['-r', '150', '-png', pdfPath, join(dir, 'page')], {
        maxBuffer: 1024 * 1024 * 64,
      });
      return parsePngList(readdirSync(dir), dir);
    },
  };
}
