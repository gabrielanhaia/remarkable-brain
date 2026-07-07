import { expect, test } from 'vitest';
import { defaultBackupName, tarArgs, resolveBackupDest } from '../src/cli/backup.js';

test('defaultBackupName embeds the stamp', () => {
  expect(defaultBackupName('2026-07-07')).toBe('rm-brain-backup-2026-07-07.tar.gz');
});

test('tarArgs archives the home folder from its parent', () => {
  expect(tarArgs('/home/x/.rm-brain', '/backups/out.tar.gz')).toEqual([
    '-czf',
    '/backups/out.tar.gz',
    '-C',
    '/home/x',
    '.rm-brain',
  ]);
});

test('resolveBackupDest honors an explicit arg, else defaults into cwd', () => {
  expect(resolveBackupDest('/cwd', 'my.tar.gz', '2026-07-07')).toBe('/cwd/my.tar.gz');
  expect(resolveBackupDest('/cwd', undefined, '2026-07-07')).toBe(
    '/cwd/rm-brain-backup-2026-07-07.tar.gz'
  );
});
