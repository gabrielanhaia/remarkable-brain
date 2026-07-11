import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isPathHardExcluded, relativeFolder } from '../config.js';
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
  forgetDoc,
  pruneDocPages,
} from './manifest.js';

export interface SyncDeps {
  repo: Repo;
  rmapi: Rmapi;
  renderer: Renderer;
  extract: (imagePath: string) => Promise<PageExtraction>;
  /** Optional: embed a page's text for semantic search. Present only when the local model is
   *  installed; when absent, sync simply skips embeddings and search stays keyword-only. */
  embed?: (text: string) => Promise<Float32Array | null>;
  brainFolder: string;
  manifestPath: string;
  imagesDir: string;
  tmpDir: string;
  log?: (msg: string) => void;
}
export interface SyncSummary {
  docsConsidered: number;
  docsSynced: number;
  pagesExtracted: number;
  prunedPages: number;
  skippedExcluded: string[];
  pruned: string[];
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
    prunedPages: 0,
    skippedExcluded: [],
    pruned: [],
    errors: [],
  };

  // Opt-in: only documents inside the Brain folder are ever fetched.
  const docs = await deps.rmapi.listFolderDocs(deps.brainFolder);
  const keep = new Set<string>(); // ids that should remain indexed after this run

  for (const doc of docs) {
    summary.docsConsidered++;
    // Hard exclusion (name/folder convention) and prior user exclusion both win, even inside the
    // folder — a document under a `private`/`noindex`/dotfolder subfolder is skipped too.
    if (isPathHardExcluded(doc.path, deps.brainFolder) || excludedIds.has(doc.id)) {
      summary.skippedExcluded.push(doc.name);
      continue;
    }
    keep.add(doc.id);
    // reMarkable's new sync leaves Version at 0 forever; ModifiedClient is the real change signal.
    const changeKey = doc.modified || doc.version;
    if (!docChanged(manifest, doc.id, changeKey)) {
      log(`unchanged: ${doc.name}`);
      continue;
    }

    let archivePath: string | undefined;
    try {
      log(`downloading ${doc.name}…`);
      archivePath = await deps.rmapi.downloadDoc(doc.path, deps.tmpDir);
      const pages = await deps.renderer.renderDocToPngs(archivePath, deps.tmpDir, doc.id);
      deps.repo.upsertNotebook({
        id: doc.id,
        name: doc.name,
        folderPath: relativeFolder(doc.path, deps.brainFolder),
      });
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
          // Build the semantic-search vector inline when the local model is available (opt-in),
          // so semantic search just works after the next sync — no separate `embed` step needed.
          if (deps.embed && ex.extracted_text.trim()) {
            try {
              const vec = await deps.embed(ex.extracted_text);
              if (vec) deps.repo.setEmbedding(pageId, vec);
            } catch {
              /* embeddings are best-effort; a failure must never break indexing */
            }
          }
          recordPage(manifest, doc.id, changeKey, pg.pageNumber, hash);
          summary.pagesExtracted++;
        } catch (err) {
          summary.errors.push({
            docId: doc.id,
            page: pg.pageNumber,
            message: String((err as Error).message),
          });
        }
      }
      // Pages deleted inside the notebook since the last render: drop their rows, images and
      // manifest entries. Guard on a non-empty render so a renderer that yields nothing (a bug or
      // transient failure) can never be mistaken for "the notebook is now empty" and wipe it.
      if (pages.length > 0) {
        const keepPages = pages.map((pg) => pg.pageNumber);
        const removedImgs = deps.repo.prunePagesNotIn(doc.id, keepPages);
        for (const img of removedImgs) rmSync(img, { force: true });
        pruneDocPages(manifest, doc.id, keepPages);
        summary.prunedPages += removedImgs.length;
      }
      summary.docsSynced++;
      saveManifest(deps.manifestPath, manifest); // persist progress per doc
    } catch (err) {
      summary.errors.push({ docId: doc.id, message: String((err as Error).message) });
    } finally {
      if (archivePath) rmSync(archivePath, { force: true });
    }
  }

  // Prune: anything previously indexed that's no longer in the Brain folder gets removed
  // (pages, images, manifest). User-excluded markers are left intact.
  for (const nb of deps.repo.listNotebooks()) {
    if (nb.excluded || keep.has(nb.id)) continue;
    log(`removing ${nb.name} (no longer in ${deps.brainFolder})…`);
    const imgs = deps.repo.purgeNotebook(nb.id);
    for (const img of imgs) rmSync(img, { force: true });
    rmSync(join(deps.imagesDir, nb.id), { recursive: true, force: true });
    forgetDoc(manifest, nb.id);
    summary.pruned.push(nb.name);
  }

  saveManifest(deps.manifestPath, manifest);
  return summary;
}
