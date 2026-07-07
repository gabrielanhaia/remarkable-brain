import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isHardExcluded, hasBrainTag } from '../config.js';
import type { Repo } from '../storage/repo.js';
import type { Rmapi } from './rmapi.js';
import type { Renderer } from './render.js';
import type { PageExtraction } from '../extraction/schema.js';
import {
  hashBuffer,
  loadManifest,
  saveManifest,
  docChanged,
  pageChanged,
  recordPage,
} from './manifest.js';

export interface SyncDeps {
  repo: Repo;
  rmapi: Rmapi;
  renderer: Renderer;
  extract: (imagePath: string) => Promise<PageExtraction>;
  manifestPath: string;
  imagesDir: string;
  tmpDir: string;
  log?: (msg: string) => void;
}
export interface SyncSummary {
  docsConsidered: number;
  docsSynced: number;
  pagesExtracted: number;
  skippedExcluded: string[];
  skippedUntagged: number;
  errors: { docId: string; page?: number; message: string }[];
}

export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const log = deps.log ?? (() => {});
  const manifest = loadManifest(deps.manifestPath);
  const excludedIds = new Set(deps.repo.listExcludedIds());
  const summary: SyncSummary = {
    docsConsidered: 0,
    docsSynced: 0,
    pagesExtracted: 0,
    skippedExcluded: [],
    skippedUntagged: 0,
    errors: [],
  };

  const docs = await deps.rmapi.listDocuments();
  for (const doc of docs) {
    summary.docsConsidered++;
    // Hard exclusion (name convention) and prior user exclusion both win over the #brain opt-in.
    if (isHardExcluded(doc.name) || excludedIds.has(doc.id)) {
      summary.skippedExcluded.push(doc.name);
      continue;
    }
    if (!hasBrainTag(doc.tags)) {
      summary.skippedUntagged++;
      continue;
    }
    if (!docChanged(manifest, doc.id, doc.version)) {
      log(`unchanged: ${doc.name}`);
      continue;
    }

    const pdfPath = join(deps.tmpDir, `${doc.id}.pdf`);
    try {
      log(`exporting ${doc.name}…`);
      await deps.rmapi.exportAnnotatedPdf(doc.id, pdfPath);
      const pngs = await deps.renderer.renderPdfToPngs(pdfPath, deps.tmpDir, doc.id);
      deps.repo.upsertNotebook({ id: doc.id, name: doc.name });
      const destDir = join(deps.imagesDir, doc.id);
      mkdirSync(destDir, { recursive: true });

      for (let i = 0; i < pngs.length; i++) {
        const pageNumber = i + 1;
        const src = pngs[i]!;
        const hash = hashBuffer(readFileSync(src));
        if (!pageChanged(manifest, doc.id, pageNumber, hash)) continue;
        const dest = join(destDir, `page-${pageNumber}.png`);
        copyFileSync(src, dest);
        try {
          log(`extracting ${doc.name} p${pageNumber} (${pageNumber}/${pngs.length})…`);
          const ex = await deps.extract(dest);
          const pageId = `${doc.id}:${pageNumber}`;
          deps.repo.upsertPage({
            id: pageId,
            notebookId: doc.id,
            pageNumber,
            writtenAt: doc.modified || null,
            imagePath: dest,
            extractedText: ex.extracted_text,
            pageType: ex.page_type,
            openLoop: ex.open_loop,
            openLoopDescription: ex.open_loop_description,
            contentHash: hash,
            extractedAt: new Date().toISOString(),
          });
          deps.repo.linkEntities(pageId, ex.entities);
          recordPage(manifest, doc.id, doc.version, pageNumber, hash);
          summary.pagesExtracted++;
        } catch (err) {
          summary.errors.push({
            docId: doc.id,
            page: pageNumber,
            message: String((err as Error).message),
          });
        }
      }
      summary.docsSynced++;
      saveManifest(deps.manifestPath, manifest); // persist progress per doc
    } catch (err) {
      summary.errors.push({ docId: doc.id, message: String((err as Error).message) });
    } finally {
      rmSync(pdfPath, { force: true });
    }
  }
  saveManifest(deps.manifestPath, manifest);
  return summary;
}
