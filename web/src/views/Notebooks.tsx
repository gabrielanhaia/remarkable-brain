/** Notebooks grid → each links to its page-thumbnail view. */
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

export function Notebooks() {
  const { data, loading, error, isEmptyIndex, reload } = useAsync(() => listNotebooks(), []);

  if (isEmptyIndex) return <EmptyIndexState />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

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
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((nb) => (
            <NotebookCard key={nb.id} notebook={nb} />
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
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <h2 className="font-display text-lg leading-tight text-ivory drop-shadow">{notebook.name}</h2>
          <span className="shrink-0 rounded-md bg-ink-950/70 px-2 py-0.5 text-xs text-ivory-dim backdrop-blur-sm">
            {plural(notebook.pageCount, 'page')}
          </span>
        </div>
      </div>
    </Link>
  );
}
