/** Entities: browse people / projects / topics, grouped by type, each linking to its timeline. */
import { useMemo, useState } from 'react';
import { listEntities } from '../api/client.js';
import { useAsync } from '../lib/hooks.js';
import { Link, routes } from '../router.js';
import { entityGlyph, formatPageType, plural } from '../lib/format.js';
import { EmptyHint, EmptyIndexState, ErrorState, Skeleton, ViewHeader } from '../components/ui.js';
import type { EntitySummary } from '../api/types.js';

export function Entities() {
  const { data, loading, error, isEmptyIndex, reload } = useAsync(() => listEntities(), []);
  const [filter, setFilter] = useState<string>('all');

  const types = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((e) => e.type))).sort();
  }, [data]);

  const shown = useMemo(() => {
    if (!data) return [];
    const list = filter === 'all' ? data : data.filter((e) => e.type === filter);
    return [...list].sort((a, b) => b.pageCount - a.pageCount || a.name.localeCompare(b.name));
  }, [data, filter]);

  if (isEmptyIndex) return <EmptyIndexState />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="animate-fade-up">
      <ViewHeader
        eyebrow="Connections"
        title="Entities"
        subtitle="The people, projects, and topics that recur across your notebooks. Open one for its timeline."
      />

      {loading || !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyHint title="No entities extracted yet" />
      ) : (
        <>
          {/* Type filter chips */}
          <div className="mb-6 flex flex-wrap gap-2">
            <TypeChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
            {types.map((t) => (
              <TypeChip
                key={t}
                label={formatPageType(t) ?? t}
                glyph={entityGlyph(t)}
                active={filter === t}
                onClick={() => setFilter(t)}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((ent) => (
              <EntityCard key={`${ent.type}:${ent.name}`} entity={ent} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TypeChip({
  label,
  glyph,
  active,
  onClick,
}: {
  label: string;
  glyph?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? 'border-pen/50 bg-pen-soft text-pen'
          : 'border-line bg-sheet text-muted hover:text-ink'
      }`}
    >
      {glyph && (
        <span className="opacity-80" aria-hidden>
          {glyph}
        </span>
      )}
      {label}
    </button>
  );
}

function EntityCard({ entity }: { entity: EntitySummary }) {
  return (
    <Link
      to={routes.entity(entity.name)}
      className="surface surface-hover group flex items-center gap-3.5 p-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-sheet text-pen">
        {entityGlyph(entity.type)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{entity.name}</p>
        <p className="text-xs text-faint">
          {formatPageType(entity.type) ?? entity.type} · {plural(entity.pageCount, 'page')}
        </p>
      </div>
      <span className="text-faint opacity-0 transition-opacity group-hover:opacity-100">→</span>
    </Link>
  );
}
