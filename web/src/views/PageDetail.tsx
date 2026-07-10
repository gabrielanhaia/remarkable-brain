/** Page detail: the scanned image beside its transcription, with type, entities, and open-loop badge. */
import { useState } from 'react';
import { getPage } from '../api/client.js';
import { useAsync } from '../lib/hooks.js';
import { Link, routes } from '../router.js';
import { entityGlyph, formatDate } from '../lib/format.js';
import {
  EmptyIndexState,
  ErrorState,
  OpenLoopBadge,
  PageTypeBadge,
  Skeleton,
} from '../components/ui.js';

export function PageDetail({ id }: { id: string }) {
  const { data, loading, error, isEmptyIndex, reload } = useAsync(() => getPage(id), [id]);

  if (isEmptyIndex) return <EmptyIndexState />;
  if (error) {
    const notFound = 'status' in error && (error as { status?: number }).status === 404;
    return (
      <ErrorState
        message={notFound ? 'That page could not be found.' : error.message}
        onRetry={notFound ? undefined : reload}
      />
    );
  }

  return (
    <div className="animate-fade-up">
      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ivory-faint">
        <Link to={routes.notebooks()} className="link-coral">
          Notebooks
        </Link>
        <span>/</span>
        {data ? (
          <Link to={routes.notebook(data.notebookId)} className="link-coral">
            {data.notebookName}
          </Link>
        ) : (
          <Skeleton className="h-4 w-24" />
        )}
        <span>/</span>
        <span className="text-ivory-dim">Page {data?.pageNumber ?? '…'}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Scanned image */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ScanViewer imageUrl={data?.imageUrl ?? null} loading={loading} pageNumber={data?.pageNumber} />
        </div>

        {/* Transcription + meta */}
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {loading ? (
              <Skeleton className="h-5 w-24 rounded-full" />
            ) : (
              <>
                {data?.openLoop && <OpenLoopBadge />}
                <PageTypeBadge type={data?.pageType} />
                <span className="text-sm text-ivory-faint">{formatDate(data?.writtenAt)}</span>
              </>
            )}
          </div>

          <h1 className="font-display text-2xl text-ivory sm:text-3xl">
            {data ? `${data.notebookName} · Page ${data.pageNumber}` : 'Loading page…'}
          </h1>

          {/* Open loop callout */}
          {data?.openLoop && (
            <div className="mt-5 rounded-xl border border-coral/30 bg-coral/8 p-4">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-coral">
                <span className="h-1.5 w-1.5 rounded-full bg-coral" />
                Open loop
              </div>
              <p className="text-sm text-ivory-dim">
                {data.openLoopDescription?.trim() || 'This page was flagged as an unfinished thread.'}
              </p>
            </div>
          )}

          {/* Transcribed text */}
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-ivory-faint">
              Transcription
            </h2>
            {loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className={`h-3.5 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
                ))}
              </div>
            ) : data?.extractedText?.trim() ? (
              <div className="whitespace-pre-wrap rounded-xl border border-ink-800 bg-ink-900/50 p-5 text-[15px] leading-relaxed text-ivory-dim">
                {data.extractedText}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-ink-700 bg-ink-900/30 p-5 text-sm text-ivory-faint">
                No text was transcribed for this page.
              </p>
            )}
          </section>

          {/* Entities */}
          <section className="mt-6">
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-ivory-faint">
              Mentioned
            </h2>
            {loading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-20 rounded-full" />
                ))}
              </div>
            ) : data && data.entities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.entities.map((ent) => (
                  <Link
                    key={`${ent.type}:${ent.name}`}
                    to={routes.entity(ent.name)}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850 px-3 py-1 text-sm text-ivory-dim transition-colors hover:border-coral/40 hover:text-coral-soft"
                    title={`${ent.type} — view timeline`}
                  >
                    <span className="text-coral opacity-80" aria-hidden>
                      {entityGlyph(ent.type)}
                    </span>
                    {ent.name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ivory-faint">No linked entities.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** The scanned page: a light paper frame with click-to-zoom. */
function ScanViewer({
  imageUrl,
  loading,
  pageNumber,
}: {
  imageUrl: string | null;
  loading: boolean;
  pageNumber?: number;
}) {
  const [zoom, setZoom] = useState(false);

  if (loading) {
    return <Skeleton className="aspect-[3/4] w-full rounded-xl" />;
  }
  if (!imageUrl) {
    return (
      <div className="flex aspect-[3/4] w-full flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 bg-ink-900/40 text-ivory-faint">
        <span className="text-4xl opacity-50">✎</span>
        <span className="mt-2 text-sm">No scan available</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="scan-frame block w-full overflow-hidden rounded-xl p-2 transition-transform hover:scale-[1.005] focus:outline-none focus-visible:ring-2 focus-visible:ring-coral"
        aria-label="Zoom scanned page"
      >
        <img
          src={imageUrl}
          alt={`Scanned page ${pageNumber ?? ''}`}
          className="w-full rounded-md"
        />
      </button>

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={imageUrl}
            alt={`Scanned page ${pageNumber ?? ''} (zoomed)`}
            className="max-h-full max-w-full rounded-lg scan-frame p-2"
          />
          <button
            className="absolute right-5 top-5 rounded-full border border-ink-600 bg-ink-900/80 px-3 py-1.5 text-sm text-ivory-dim hover:text-ivory"
            onClick={() => setZoom(false)}
          >
            Close ✕
          </button>
        </div>
      )}
    </>
  );
}
