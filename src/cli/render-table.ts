import Table from 'cli-table3';

export function notebooksTable(
  rows: { id: string; name: string; excluded: boolean; pageCount: number }[]
): string {
  const t = new Table({ head: ['Notebook', 'Pages', 'Excluded'] });
  for (const r of rows) t.push([r.name, String(r.pageCount), r.excluded ? 'yes' : '']);
  return t.toString();
}
