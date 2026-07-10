/** A single entity's chronological timeline across notebooks — each entry links to its page. */
import { getEntityTimeline, pageImageUrl } from '../api/client.js';
import { useAsync } from '../lib/hooks.js';
import { Link, routes } from '../router.js';
import { formatDate } from '../lib/format.js';
import {
  EmptyHint,
  EmptyIndexState,
  ErrorState,
  ScanThumb,
  Skeleton,
  ViewHeader,
} from '../components/ui.js';
import type { TimelineEntry } from '../api/types.js';

export function EntityTimeline({ name }: { name: string }) {
  const { data, loading, error, isEmptyIndex, reload } = useAsync(
    () => getEntityTimeline(name),
    [name]
  );

  if (isEmptyIndex) return <EmptyIndexState />;
  if (error) {
    const notFound = 'status' in error && (error as { status?: number }).status === 404;
    return (
      <ErrorState
        message={notFound ? 'No timeline found for that entity.' : error.message}
        onRetry={notFound ? undefined : reload}
      />
    );
  }

  return (
    <div className="animate-fade-up">
      <nav className="mb-4 text-sm text-ivory-faint">
        <Link to={routes.entities()} className="link-coral">
          Entities
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ivory-dim">{name}</span>
      </nav>

      <ViewHeader
        eyebrow="Timeline"
        title={name}
        subtitle={
          data ? `Mentioned across ${data.length} page${data.length === 1 ? '' : 's'}.` : undefined
        }
      />

      {loading || !data ? (
        <div className="space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyHint title="No mentions found" />
      ) : (
        <ol className="relative ml-3 space-y-6 border-l border-ink-700 pl-6">
          {data.map((entry) => (
            <TimelineItem key={entry.pageId} entry={entry} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const thumb = pageImageUrl(entry.pageId);
  return (
    <li className="relative">
      {/* Node on the rail */}
      <span className="absolute -left-[1.9rem] top-1.5 h-3 w-3 rounded-full border-2 border-ink-950 bg-coral shadow-[0_0_12px_rgba(217,119,87,0.5)]" />
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-coral">
        {formatDate(entry.writtenAt)}
      </div>
      <Link
        to={routes.page(entry.pageId)}
        className="surface surface-hover group flex gap-4 p-3.5"
      >
        <ScanThumb
          src={thumb}
          alt={`Page ${entry.pageNumber}`}
          className="h-24 w-[4.5rem] shrink-0 rounded-lg border border-ink-700"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ivory">
            {entry.notebookName} <span className="text-ivory-faint">· p.{entry.pageNumber}</span>
          </p>
          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ivory-dim">
            {entry.snippet?.trim() || 'Mentioned on this page.'}
          </p>
        </div>
        <span className="self-center text-ivory-faint opacity-0 transition-opacity group-hover:opacity-100">
          →
        </span>
      </Link>
    </li>
  );
}
