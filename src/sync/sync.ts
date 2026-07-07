import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_TAG, isHardExcluded, hasBrainTag } from '../config.js';
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
    errors: [],
  };

  // Opt-in: only #brain-tagged documents are ever fetched.
  const docs = await deps.rmapi.listBrainDocs(BRAIN_TAG);
  for (const doc of docs) {
    summary.docsConsidered++;
    // Hard exclusion (name convention), prior user exclusion, or a missing tag all win over opt-in.
    if (isHardExcluded(doc.name) || excludedIds.has(doc.id) || !hasBrainTag(doc.tags)) {
      summary.skippedExcluded.push(doc.name);
      continue;
    }
    if (!docChanged(manifest, doc.id, doc.version)) {
      log(`unchanged: ${doc.name}`);
      continue;
    }

    let archivePath: string | undefined;
    try {
      log(`downloading ${doc.name}…`);
      archivePath = await deps.rmapi.downloadDoc(doc.path, deps.tmpDir);
      const pages = await deps.renderer.renderDocToPngs(archivePath, deps.tmpDir, doc.id);
      deps.repo.upsertNotebook({ id: doc.id, name: doc.name });
      const destDir = join(deps.imagesDir, doc.id);
      mkdirSync(destDir, { recursive: true });

      for (const pg of pages) {
        const hash = hashBuffer(readFileSync(pg.path));
        if (!pageChanged(manifest, doc.id, pg.pageNumber, hash)) continue;
        const dest = join(destDir, `page-${pg.pageNumber}.png`);
        copyFileSync(pg.path, dest);
        try {
          log(`extracting ${doc.name} p${pg.pageNumber}…`);
          const ex = await deps.extract(dest);
          const pageId = `${doc.id}:${pg.pageNumber}`;
          deps.repo.upsertPage({
            id: pageId,
            notebookId: doc.id,
            pageNumber: pg.pageNumber,
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
          recordPage(manifest, doc.id, doc.version, pg.pageNumber, hash);
          summary.pagesExtracted++;
        } catch (err) {
          summary.errors.push({
            docId: doc.id,
            page: pg.pageNumber,
            message: String((err as Error).message),
          });
        }
      }
      summary.docsSynced++;
      saveManifest(deps.manifestPath, manifest); // persist progress per doc
    } catch (err) {
      summary.errors.push({ docId: doc.id, message: String((err as Error).message) });
    } finally {
      if (archivePath) rmSync(archivePath, { force: true });
    }
  }
  saveManifest(deps.manifestPath, manifest);
  return summary;
}
