/** A single notebook: its pages as a grid of real-handwriting thumbnails. */
import { getNotebook } from '../api/client.js';
import { useAsync } from '../lib/hooks.js';
import { Link, routes } from '../router.js';
import { plural } from '../lib/format.js';
import {
  CardGridSkeleton,
  EmptyHint,
  EmptyIndexState,
  ErrorState,
  PageCard,
  ViewHeader,
} from '../components/ui.js';

export function NotebookDetail({ id }: { id: string }) {
  const { data, loading, error, isEmptyIndex, reload } = useAsync(() => getNotebook(id), [id]);

  if (isEmptyIndex) return <EmptyIndexState />;
  if (error) {
    const notFound = 'status' in error && (error as { status?: number }).status === 404;
    return (
      <ErrorState
        message={notFound ? 'That notebook could not be found.' : error.message}
        onRetry={notFound ? undefined : reload}
      />
    );
  }

  return (
    <div className="animate-fade-up">
      <Breadcrumb />
      <ViewHeader
        eyebrow="Notebook"
        title={data?.name ?? (loading ? 'Loading…' : 'Notebook')}
        subtitle={data ? plural(data.pageCount, 'page') : undefined}
      />
      {loading || !data ? (
        <CardGridSkeleton count={8} />
      ) : data.pages.length === 0 ? (
        <EmptyHint title="This notebook has no indexed pages" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.pages.map((page) => (
            <PageCard key={page.id} page={page} notebookName={data.name} />
          ))}
        </div>
      )}
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav className="mb-4 text-sm text-faint">
      <Link to={routes.notebooks()} className="link-pen">
        Notebooks
      </Link>
      <span className="mx-2">/</span>
      <span className="text-muted">this notebook</span>
    </nav>
  );
}
