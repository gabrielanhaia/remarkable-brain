/** Overview: stat tiles, recent open loops, and a feed of recently written pages. */
import { getOverview } from '../api/client.js';
import { useAsync } from '../lib/hooks.js';
import { Link, routes } from '../router.js';
import { formatRelative } from '../lib/format.js';
import {
  CardGridSkeleton,
  EmptyHint,
  EmptyIndexState,
  ErrorState,
  PageCard,
  Skeleton,
  ViewHeader,
} from '../components/ui.js';
import type { OpenLoop, OverviewCounts } from '../api/types.js';

const STAT_META: { key: keyof OverviewCounts; label: string; to: string; noun: string }[] = [
  { key: 'notebooks', label: 'Notebooks', to: routes.notebooks(), noun: 'notebook' },
  { key: 'pages', label: 'Pages', to: routes.search(), noun: 'page' },
  { key: 'openLoops', label: 'Open Loops', to: routes.openLoops(), noun: 'loop' },
  { key: 'entities', label: 'Entities', to: routes.entities(), noun: 'entity' },
];

export function Dashboard() {
  const { data, loading, error, isEmptyIndex, reload } = useAsync(() => getOverview(), []);

  if (isEmptyIndex) return <EmptyIndexState />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="animate-fade-up">
      <ViewHeader
        eyebrow="Overview"
        title="Your desk, at a glance"
        subtitle="Everything indexed from your reMarkable — searchable, browsable, and entirely on this machine."
      />

      {/* Stat tiles */}
      <div className="mb-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_META.map((s) =>
          loading || !data ? (
            <div key={s.key} className="surface p-5">
              <Skeleton className="h-9 w-16" />
              <Skeleton className="mt-3 h-3 w-20" />
            </div>
          ) : (
            <Link
              key={s.key}
              to={s.to}
              className="surface surface-hover group relative overflow-hidden p-5"
            >
              <div className="font-display text-4xl font-bold text-ink tabular-nums">
                {data.counts[s.key].toLocaleString()}
              </div>
              <div className="mt-2 text-sm font-medium text-muted">{s.label}</div>
            </Link>
          )
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        {/* Recent open loops */}
        <section>
          <SectionTitle
            title="Recent open loops"
            hint="Unfinished threads"
            to={routes.openLoops()}
          />
          {loading || !data ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : data.recentOpenLoops.length === 0 ? (
            <EmptyHint icon="✓" title="No open loops">
              Nothing left dangling — every thread is tied off.
            </EmptyHint>
          ) : (
            <ul className="space-y-3">
              {data.recentOpenLoops.map((loop) => (
                <li key={loop.pageId}>
                  <OpenLoopRow loop={loop} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent pages */}
        <section>
          <SectionTitle title="Recently written" hint="Freshly indexed" to={routes.notebooks()} />
          {loading || !data ? (
            <CardGridSkeleton count={6} />
          ) : data.recentPages.length === 0 ? (
            <EmptyHint title="No pages yet" />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {data.recentPages.map((page) => (
                <PageCard key={page.id} page={page} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint, to }: { title: string; hint?: string; to?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        {hint && <p className="text-xs text-faint">{hint}</p>}
      </div>
      {to && (
        <Link to={to} className="text-xs font-medium link-pen">
          View all →
        </Link>
      )}
    </div>
  );
}

export function OpenLoopRow({ loop }: { loop: OpenLoop }) {
  return (
    <Link
      to={routes.page(loop.pageId)}
      className="surface surface-hover group flex items-start gap-3 p-4"
    >
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-pen" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-serif text-sm text-ink">
          {loop.description?.trim() || 'Open loop (no description captured)'}
        </p>
        <p className="mt-1.5 truncate text-xs text-faint">
          {loop.notebookName} · p.{loop.pageNumber} · {formatRelative(loop.writtenAt)}
        </p>
      </div>
      <span className="mt-0.5 text-faint opacity-0 transition-opacity group-hover:opacity-100">
        →
      </span>
    </Link>
  );
}
