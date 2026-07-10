/** Shared presentational primitives: skeletons, empty/error states, badges, thumbnails. */
import type { ReactNode } from 'react';
import { Link, routes } from '../router.js';
import { formatPageType, formatRelative } from '../lib/format.js';
import type { NotebookPage, RecentPage } from '../api/types.js';

// ── Skeletons ────────────────────────────────────────────────────────────────────────────────────

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface overflow-hidden">
          <Skeleton className="aspect-[3/4] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Ink marks ──────────────────────────────────────────────────────────────────────────────────

/** A hand-drawn fountain-pen lasso, the signature mark for an open loop. Decorative. */
export function InkLasso({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 62"
      preserveAspectRatio="none"
      className={className}
      fill="none"
      aria-hidden
    >
      <path
        d="M22 34C10 14 66 6 132 7c72 1 100 11 96 27-4 16-74 22-146 20C36 53 8 45 15 30 20 19 44 14 76 13"
        stroke="rgb(var(--pen))"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── States ───────────────────────────────────────────────────────────────────────────────────────

/** The global "nothing indexed" state — shown whenever an endpoint returns 503. */
export function EmptyIndexState() {
  return (
    <div className="mx-auto flex max-w-xl animate-fade-up flex-col items-center py-24 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-md border border-line bg-sheet text-3xl text-pen shadow-card">
        <span aria-hidden>✎</span>
      </div>
      <h2 className="font-display text-2xl font-bold text-ink">No notes indexed yet</h2>
      <p className="mt-3 max-w-md text-muted">
        Your local index is empty. Scan and index your reMarkable notebooks, then this page fills
        with your handwriting.
      </p>
      <div className="mt-6 flex items-center gap-2 rounded-md border border-line bg-sheet px-4 py-2.5 font-mono text-sm text-pen shadow-card">
        <span className="select-none text-faint">$</span>
        <code>rm-brain sync</code>
      </div>
    </div>
  );
}

/** Generic error card with a retry affordance. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg animate-fade-in flex-col items-center py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-high/40 bg-high/10 text-2xl text-high">
        <span aria-hidden>!</span>
      </div>
      <h2 className="font-display text-xl font-bold text-ink">Something went wrong</h2>
      <p className="mt-2 text-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-6 rounded-md border border-line bg-sheet px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-pen/50 hover:text-pen"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** In-context empty state (e.g. "no results", "no open loops"). */
export function EmptyHint({ icon = '∅', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex animate-fade-in flex-col items-center rounded-md border border-dashed border-line bg-sheet/50 py-16 text-center">
      <div className="mb-3 text-3xl text-faint" aria-hidden>
        {icon}
      </div>
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
    </div>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────────────────────────

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'pen' | 'outline' | 'coral';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-line bg-sheet text-muted',
    // 'coral' kept as an alias of the pen accent so older callers keep working.
    pen: 'border-pen/40 bg-pen-soft text-pen',
    coral: 'border-pen/40 bg-pen-soft text-pen',
    outline: 'border-line bg-transparent text-faint',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Open loop marker: a small ink-diamond + label, in pen. Legible as an overlay on a light scan. */
export function OpenLoopBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border border-pen/50 bg-sheet/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-pen backdrop-blur-sm ${className}`}
    >
      <span className="h-1.5 w-1.5 rotate-45 bg-pen" aria-hidden />
      Open loop
    </span>
  );
}

export function PageTypeBadge({ type }: { type: string | null | undefined }) {
  const label = formatPageType(type);
  if (!label) return null;
  return <Badge tone="neutral">{label}</Badge>;
}

// ── Thumbnails ───────────────────────────────────────────────────────────────────────────────────

/** A scanned-page image with graceful fallback to a paper-placeholder when it fails/absent. */
export function ScanThumb({
  src,
  alt,
  className = '',
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div className={`group/thumb relative overflow-hidden scan-sheet ruled ${className}`}>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover object-top transition-transform duration-500 group-hover/thumb:scale-[1.03]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            const ph = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (ph) ph.style.display = 'flex';
          }}
        />
      ) : null}
      <div
        className="absolute inset-0 hidden items-center justify-center scan-sheet"
        style={{ display: src ? 'none' : 'flex' }}
        aria-hidden
      >
        <span className="text-3xl opacity-30">✎</span>
      </div>
    </div>
  );
}

/** A full page card used in notebook grids and the dashboard recent feed. */
export function PageCard({ page, notebookName }: { page: NotebookPage | RecentPage; notebookName?: string }) {
  const name = 'notebookName' in page ? page.notebookName : notebookName;
  return (
    <Link
      to={routes.page(page.id)}
      className="surface surface-hover group flex flex-col overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-pen"
    >
      <div className="relative">
        <ScanThumb src={page.imageUrl} alt={`Page ${page.pageNumber}`} className="aspect-[3/4] w-full" />
        {page.openLoop && (
          <div className="absolute left-2.5 top-2.5">
            <OpenLoopBadge />
          </div>
        )}
        <div className="absolute right-2.5 top-2.5 rounded-sm bg-sheet/85 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink backdrop-blur-sm">
          p.{page.pageNumber}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          {name && <span className="truncate text-sm font-medium text-ink">{name}</span>}
          <span className="shrink-0 font-mono text-xs text-faint">{formatRelative(page.writtenAt)}</span>
        </div>
        {formatPageType(page.pageType) && (
          <span className="text-xs text-faint">{formatPageType(page.pageType)}</span>
        )}
      </div>
    </Link>
  );
}

// ── Page header ──────────────────────────────────────────────────────────────────────────────────

export function ViewHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-pen">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl font-bold tracking-[-0.012em] text-ink sm:text-4xl">
          {title}
        </h1>
        {subtitle && <p className="mt-2 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
