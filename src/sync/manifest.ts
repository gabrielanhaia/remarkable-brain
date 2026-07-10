import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DocManifest {
  version: string;
  pages: Record<number, string>;
}
export interface Manifest {
  docs: Record<string, DocManifest>;
}

export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function loadManifest(path: string): Manifest {
  if (!existsSync(path)) return { docs: {} };
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  } catch {
    return { docs: {} };
  }
}

export function saveManifest(path: string, m: Manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(m, null, 2));
}

export function docChanged(m: Manifest, docId: string, version: string): boolean {
  return m.docs[docId]?.version !== version;
}

export function pageChanged(m: Manifest, docId: string, pageNumber: number, hash: string): boolean {
  return m.docs[docId]?.pages[pageNumber] !== hash;
}

export function recordPage(
  m: Manifest,
  docId: string,
  version: string,
  pageNumber: number,
  hash: string
): void {
  const doc = (m.docs[docId] ??= { version, pages: {} });
  doc.version = version;
  doc.pages[pageNumber] = hash;
}

/** Drop a document from the manifest (used when it leaves the Brain folder). */
export function forgetDoc(m: Manifest, docId: string): void {
  delete m.docs[docId];
}

/** Drop page hashes no longer present in the document (used when pages are deleted in-place). */
export function pruneDocPages(m: Manifest, docId: string, keepPageNumbers: number[]): void {
  const doc = m.docs[docId];
  if (!doc) return;
  const keep = new Set(keepPageNumbers);
  for (const key of Object.keys(doc.pages)) {
    if (!keep.has(Number(key))) delete doc.pages[Number(key)];
  }
}
