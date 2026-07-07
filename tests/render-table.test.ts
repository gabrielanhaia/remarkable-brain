import { expect, test } from 'vitest';
import { notebooksTable } from '../src/cli/render-table.js';

test('notebooksTable includes names and counts', () => {
  const out = notebooksTable([{ id: 'n1', name: 'Work', excluded: false, pageCount: 3 }]);
  expect(out).toContain('Work');
  expect(out).toContain('3');
});
