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

// ── States ───────────────────────────────────────────────────────────────────────────────────────

/** The global "nothing indexed" state — shown whenever an endpoint returns 503. */
export function EmptyIndexState() {
  return (
    <div className="mx-auto flex max-w-xl animate-fade-up flex-col items-center py-24 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-ink-700 bg-ink-850 text-3xl shadow-card">
        <span aria-hidden>✎</span>
      </div>
      <h2 className="font-display text-2xl text-ivory">No notes indexed yet</h2>
      <p className="mt-3 max-w-md text-ivory-dim">
        Your local index is empty. Scan and index your reMarkable notebooks, then this page fills
        with your handwriting.
      </p>
      <div className="mt-6 flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2.5 font-mono text-sm text-coral-soft">
        <span className="select-none text-ivory-faint">$</span>
        <code>rm-brain sync</code>
      </div>
    </div>
  );
}

/** Generic error card with a retry affordance. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg animate-fade-in flex-col items-center py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-coral-deep/50 bg-coral-deep/10 text-2xl text-coral">
        <span aria-hidden>!</span>
      </div>
      <h2 className="font-display text-xl text-ivory">Something went wrong</h2>
      <p className="mt-2 text-ivory-dim">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-6 rounded-lg border border-ink-600 bg-ink-850 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-coral/50 hover:text-coral-soft"
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
    <div className="flex animate-fade-in flex-col items-center rounded-xl border border-dashed border-ink-700 bg-ink-900/40 py-16 text-center">
      <div className="mb-3 text-3xl text-ivory-faint" aria-hidden>
        {icon}
      </div>
      <p className="font-display text-lg text-ivory">{title}</p>
      {children && <p className="mt-1.5 max-w-sm text-sm text-ivory-dim">{children}</p>}
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
  tone?: 'neutral' | 'coral' | 'outline';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-ink-600 bg-ink-800 text-ivory-dim',
    coral: 'border-coral/40 bg-coral/12 text-coral-soft',
    outline: 'border-ink-600 bg-transparent text-ivory-faint',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function OpenLoopBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-coral/50 bg-coral/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-coral-soft ${className}`}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" aria-hidden />
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
    <div className={`group/thumb relative overflow-hidden bg-ink-800 ${className}`}>
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
        className="absolute inset-0 hidden items-center justify-center bg-gradient-to-br from-ink-800 to-ink-900 text-ivory-faint"
        style={{ display: src ? 'none' : 'flex' }}
        aria-hidden
      >
        <span className="text-3xl opacity-50">✎</span>
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
      className="surface surface-hover group flex flex-col overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-coral"
    >
      <div className="relative">
        <ScanThumb src={page.imageUrl} alt={`Page ${page.pageNumber}`} className="aspect-[3/4] w-full" />
        {page.openLoop && (
          <div className="absolute left-2.5 top-2.5">
            <OpenLoopBadge />
          </div>
        )}
        <div className="absolute right-2.5 top-2.5 rounded-md bg-ink-950/80 px-1.5 py-0.5 text-[11px] font-medium text-ivory-dim backdrop-blur-sm">
          p.{page.pageNumber}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          {name && <span className="truncate text-sm font-medium text-ivory">{name}</span>}
          <span className="shrink-0 text-xs text-ivory-faint">{formatRelative(page.writtenAt)}</span>
        </div>
        {formatPageType(page.pageType) && (
          <span className="text-xs text-ivory-faint">{formatPageType(page.pageType)}</span>
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
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-coral">{eyebrow}</div>
        )}
        <h1 className="font-display text-3xl text-ivory sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-ivory-dim">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
