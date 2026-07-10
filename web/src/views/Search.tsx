/** Search — the headline view. Prominent box, live results as page cards with snippet + provenance. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listNotebooks, pageImageUrl, search } from '../api/client.js';
import { useAsync, useDebounced } from '../lib/hooks.js';
import { Link, navigate, routes, useLocation, useSearchFocusListener } from '../router.js';
import { formatRelative } from '../lib/format.js';
import { EmptyHint, EmptyIndexState, ErrorState, ScanThumb, Skeleton } from '../components/ui.js';
import type { SearchFilters, SearchResult } from '../api/types.js';

export function Search() {
  const { query } = useLocation();
  const urlQ = query.get('q') ?? '';
  const [input, setInput] = useState(urlQ);
  const [notebook, setNotebook] = useState('');
  const [type, setType] = useState('');
  const [openLoop, setOpenLoop] = useState(false);
  const boxRef = useRef<HTMLInputElement>(null);

  // Keep the box in sync when arriving via a URL that carries ?q=.
  useEffect(() => {
    setInput(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  useSearchFocusListener(
    useCallback(() => {
      boxRef.current?.focus();
      boxRef.current?.select();
    }, [])
  );

  // Autofocus on first mount.
  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  const debounced = useDebounced(input.trim(), 250);

  // Reflect the query in the URL (replace, so typing doesn't spam history).
  useEffect(() => {
    const current = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('q') ?? '';
    if (debounced !== current) {
      navigate(debounced ? routes.search(debounced) : routes.search(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const filters: SearchFilters = useMemo(
    () => ({
      notebook: notebook || undefined,
      type: type.trim() || undefined,
      openLoop: openLoop || undefined,
    }),
    [notebook, type, openLoop]
  );

  const notebooksState = useAsync(() => listNotebooks(), []);
  const hasQuery = debounced.length > 0;

  const results = useAsync<SearchResult[]>(
    () => (hasQuery ? search(debounced, filters) : Promise.resolve([])),
    [debounced, filters.notebook, filters.type, filters.openLoop]
  );

  const hasActiveFilters = Boolean(notebook || type.trim() || openLoop);

  if (results.isEmptyIndex || notebooksState.isEmptyIndex) return <EmptyIndexState />;

  return (
    <div className="animate-fade-up">
      {/* Hero search */}
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-coral">
          Search
        </div>
        <h1 className="font-display text-3xl text-ivory text-balance sm:text-4xl">
          Find anything you wrote
        </h1>
        <p className="mt-2 text-ivory-dim">
          Keyword search across every indexed page of your handwriting.
        </p>

        <div className="relative mt-7">
          <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ivory-faint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={boxRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            type="search"
            placeholder="Try a name, a project, a phrase…"
            aria-label="Search your notes"
            className="w-full rounded-2xl border border-ink-700 bg-ink-900/80 py-4 pl-14 pr-5 text-lg text-ivory shadow-card placeholder:text-ivory-faint focus:border-coral/60 focus:shadow-glow focus:outline-none"
          />
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          <select
            value={notebook}
            onChange={(e) => setNotebook(e.target.value)}
            aria-label="Filter by notebook"
            className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-ivory-dim focus:border-coral/60 focus:outline-none"
          >
            <option value="">All notebooks</option>
            {notebooksState.data?.map((nb) => (
              <option key={nb.id} value={nb.id}>
                {nb.name}
              </option>
            ))}
          </select>

          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Any page type"
            aria-label="Filter by page type"
            className="w-36 rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-ivory-dim placeholder:text-ivory-faint focus:border-coral/60 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => setOpenLoop((v) => !v)}
            aria-pressed={openLoop}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              openLoop
                ? 'border-coral/50 bg-coral/12 text-coral-soft'
                : 'border-ink-700 bg-ink-900 text-ivory-dim hover:text-ivory'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${openLoop ? 'bg-coral' : 'bg-ivory-faint'}`} />
            Open loops only
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setNotebook('');
                setType('');
                setOpenLoop(false);
              }}
              className="text-sm text-ivory-faint underline-offset-2 hover:text-coral-soft hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="mx-auto mt-10 max-w-4xl">
        {!hasQuery ? (
          <StartHint />
        ) : results.error && !results.isEmptyIndex ? (
          <ErrorState message={results.error.message} onRetry={results.reload} />
        ) : results.loading ? (
          <ResultsSkeleton />
        ) : (results.data?.length ?? 0) === 0 ? (
          <EmptyHint icon="⌕" title={`No matches for “${debounced}”`}>
            Try a different phrase{hasActiveFilters ? ', or clear your filters' : ''}. Search is
            keyword-based — exact words match best.
          </EmptyHint>
        ) : (
          <>
            <p className="mb-4 text-sm text-ivory-faint">
              {results.data!.length.toLocaleString()} result{results.data!.length === 1 ? '' : 's'}
              {' for '}
              <span className="text-ivory-dim">“{debounced}”</span>
            </p>
            <ul className="space-y-3">
              {results.data!.map((hit) => (
                <li key={hit.pageId}>
                  <ResultCard hit={hit} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function ResultCard({ hit }: { hit: SearchResult }) {
  const thumb = pageImageUrl(hit.pageId);
  return (
    <Link
      to={routes.page(hit.pageId)}
      className="surface surface-hover group flex gap-4 p-3.5"
    >
      <ScanThumb
        src={thumb}
        alt={`Page ${hit.pageNumber}`}
        className="h-24 w-[4.5rem] shrink-0 rounded-lg border border-ink-700"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium text-ivory">{hit.notebookName}</span>
          <span className="text-ivory-faint">·</span>
          <span className="shrink-0 text-ivory-faint">p.{hit.pageNumber}</span>
          <span className="ml-auto shrink-0 text-xs text-ivory-faint">
            {formatRelative(hit.writtenAt)}
          </span>
        </div>
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ivory-dim">
          {hit.snippet?.trim() || 'Match found on this page.'}
        </p>
      </div>
      <span className="self-center text-ivory-faint opacity-0 transition-opacity group-hover:opacity-100">
        →
      </span>
    </Link>
  );
}

function StartHint() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-4 text-4xl text-ivory-faint opacity-60" aria-hidden>
        ⌕
      </div>
      <p className="font-display text-lg text-ivory">Start typing to search</p>
      <p className="mt-1.5 max-w-sm text-sm text-ivory-dim">
        Every word from your scanned pages is indexed. Filter by notebook, page type, or open loops.
      </p>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="surface flex gap-4 p-3.5">
          <Skeleton className="h-24 w-[4.5rem] shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}
