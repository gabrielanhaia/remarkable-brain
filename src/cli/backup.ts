import { basename, dirname, join, resolve } from 'node:path';

/**
 * The entire data home (db.sqlite + images/ + manifest.json) is a single
 * self-contained, portable folder. A backup is just a gzip'd tar of it — restore
 * by extracting anywhere and pointing RM_BRAIN_HOME at the result.
 */

export function defaultBackupName(stamp: string): string {
  return `rm-brain-backup-${stamp}.tar.gz`;
}

/** Build `tar` args that archive the home folder from its parent, preserving the folder name. */
export function tarArgs(home: string, dest: string): string[] {
  const parent = dirname(resolve(home));
  const folder = basename(resolve(home));
  return ['-czf', resolve(dest), '-C', parent, folder];
}

export function resolveBackupDest(cwd: string, arg: string | undefined, stamp: string): string {
  if (arg && arg.trim()) return resolve(cwd, arg.trim());
  return join(cwd, defaultBackupName(stamp));
}
