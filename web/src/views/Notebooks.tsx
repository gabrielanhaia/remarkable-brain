/** Notebooks grid → each links to its page-thumbnail view. */
import { Fragment } from 'react';
import { getNotebook, listNotebooks } from '../api/client.js';
import { useAsync } from '../lib/hooks.js';
import { Link, routes } from '../router.js';
import { plural } from '../lib/format.js';
import {
  CardGridSkeleton,
  EmptyHint,
  EmptyIndexState,
  ErrorState,
  ScanThumb,
  ViewHeader,
} from '../components/ui.js';
import type { NotebookSummary } from '../api/types.js';

type FolderGroup = { folderPath: string; notebooks: NotebookSummary[] };

/** Group notebooks by folderPath: root ('') first, then folders A→Z (case-insensitive). */
function groupByFolder(data: NotebookSummary[] | null | undefined): FolderGroup[] {
  if (!data) return [];
  const map = new Map<string, NotebookSummary[]>();
  for (const nb of data) {
    const key = nb.folderPath ?? '';
    const arr = map.get(key);
    if (arr) arr.push(nb);
    else map.set(key, [nb]);
  }
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
  return keys.map((folderPath) => ({ folderPath, notebooks: map.get(folderPath)! }));
}

export function Notebooks() {
  const { data, loading, error, isEmptyIndex, reload } = useAsync(() => listNotebooks(), []);

  if (isEmptyIndex) return <EmptyIndexState />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const groups = groupByFolder(data);

  return (
    <div className="animate-fade-up">
      <ViewHeader
        eyebrow="Library"
        title="Notebooks"
        subtitle="Your reMarkable notebooks, as indexed. Open one to browse the scanned pages."
      />
      {loading || !data ? (
        <CardGridSkeleton count={6} />
      ) : data.length === 0 ? (
        <EmptyHint title="No notebooks" />
      ) : groups.length === 1 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups[0]!.notebooks.map((nb) => (
            <NotebookCard key={nb.id} notebook={nb} />
          ))}
        </div>
      ) : (
        <div>
          {groups.map((group) => (
            <Fragment key={group.folderPath}>
              <div className="mb-3 mt-10 font-mono text-xs uppercase tracking-[0.18em] text-faint first:mt-0">
                {group.folderPath === '' ? 'In the Brain root' : group.folderPath.replace(/\//g, ' / ')}
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {group.notebooks.map((nb) => (
                  <NotebookCard key={nb.id} notebook={nb} />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fetches the notebook's first page as a cover thumbnail. Cheap: one call each, single-user local. */
function NotebookCard({ notebook }: { notebook: NotebookSummary }) {
  const detail = useAsync(() => getNotebook(notebook.id), [notebook.id]);
  const cover = detail.data?.pages.find((p) => p.imageUrl)?.imageUrl ?? null;

  return (
    <Link
      to={routes.notebook(notebook.id)}
      className="surface surface-hover group flex flex-col overflow-hidden"
    >
      <div className="relative">
        <ScanThumb src={cover} alt={notebook.name} className="aspect-[4/3] w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-paper/80 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <h2 className="font-display text-lg font-semibold leading-tight text-ink drop-shadow">{notebook.name}</h2>
          <span className="shrink-0 rounded-md bg-paper/70 px-2 py-0.5 text-xs text-muted backdrop-blur-sm">
            {plural(notebook.pageCount, 'page')}
          </span>
        </div>
      </div>
    </Link>
  );
}
