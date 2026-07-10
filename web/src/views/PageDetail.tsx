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
      <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-faint">
        <Link to={routes.notebooks()} className="link-pen">
          Notebooks
        </Link>
        <span>/</span>
        {data ? (
          <Link to={routes.notebook(data.notebookId)} className="link-pen">
            {data.notebookName}
          </Link>
        ) : (
          <Skeleton className="h-4 w-24" />
        )}
        <span>/</span>
        <span className="text-muted">Page {data?.pageNumber ?? '…'}</span>
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
                <span className="text-sm text-faint">{formatDate(data?.writtenAt)}</span>
              </>
            )}
          </div>

          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            {data ? `${data.notebookName} · Page ${data.pageNumber}` : 'Loading page…'}
          </h1>

          {/* Open loop callout */}
          {data?.openLoop && (
            <div className="mt-5 rounded-md border border-pen/30 bg-pen-soft p-4">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-pen">
                <span className="h-1.5 w-1.5 rounded-full bg-pen" />
                Open loop
              </div>
              <p className="text-sm text-muted">
                {data.openLoopDescription?.trim() || 'This page was flagged as an unfinished thread.'}
              </p>
            </div>
          )}

          {/* Transcribed text */}
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-faint">
              Transcription
            </h2>
            {loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className={`h-3.5 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
                ))}
              </div>
            ) : data?.extractedText?.trim() ? (
              <div className="whitespace-pre-wrap rounded-md border border-line bg-sheet p-5 font-serif text-[15px] leading-relaxed text-ink">
                {data.extractedText}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-line bg-sheet p-5 text-sm text-faint">
                No text was transcribed for this page.
              </p>
            )}
          </section>

          {/* Entities */}
          <section className="mt-6">
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-faint">
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
                    className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-sheet px-3 py-1 text-sm text-muted transition-colors hover:border-pen/40 hover:text-pen"
                    title={`${ent.type} — view timeline`}
                  >
                    <span className="text-pen opacity-80" aria-hidden>
                      {entityGlyph(ent.type)}
                    </span>
                    {ent.name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-faint">No linked entities.</p>
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
    return <Skeleton className="aspect-[3/4] w-full rounded-md" />;
  }
  if (!imageUrl) {
    return (
      <div className="flex aspect-[3/4] w-full flex-col items-center justify-center rounded-md border border-dashed border-line bg-sheet text-faint">
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
        className="scan-sheet block w-full overflow-hidden rounded-md p-2 transition-transform hover:scale-[1.005] focus:outline-none focus-visible:ring-2 focus-visible:ring-pen"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={imageUrl}
            alt={`Scanned page ${pageNumber ?? ''} (zoomed)`}
            className="max-h-full max-w-full rounded-lg scan-sheet p-2"
          />
          <button
            className="absolute right-5 top-5 rounded-full border border-line bg-sheet px-3 py-1.5 text-sm text-muted hover:text-ink"
            onClick={() => setZoom(false)}
          >
            Close ✕
          </button>
        </div>
      )}
    </>
  );
}
