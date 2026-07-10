/**
 * Tiny hash-based client-side router.
 *
 * Hash routing is deliberate: the SPA is built with a relative base (`base: './'`) and served by the
 * local rm-brain server with an index.html fallback. Keeping all navigation in `location.hash` means
 * the server only ever serves `/` and asset requests resolve correctly on refresh of any deep route.
 *
 * Routes are matched with a small `/segment/:param` matcher. Params are URL-decoded.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from 'react';

export interface RouteMatch {
  /** The path portion of the hash, e.g. `/notebooks/abc` (no leading `#`, no query). */
  path: string;
  /** Parsed query string of the hash (after `?`). */
  query: URLSearchParams;
}

function readHash(): string {
  const raw = window.location.hash.replace(/^#/, '');
  return raw.length === 0 ? '/' : raw;
}

function parse(hash: string): RouteMatch {
  const qIndex = hash.indexOf('?');
  const path = qIndex === -1 ? hash : hash.slice(0, qIndex);
  const query = new URLSearchParams(qIndex === -1 ? '' : hash.slice(qIndex + 1));
  return { path: path || '/', query };
}

// ── external store so any component can subscribe to the current location ────────────────────────

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
function getSnapshot(): string {
  return readHash();
}

export function useLocation(): RouteMatch {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '/');
  return useMemo(() => parse(hash), [hash]);
}

/** Programmatic navigation. `to` is a path like `/pages/abc` (optionally with `?query`). */
export function navigate(to: string, opts?: { replace?: boolean }): void {
  const target = `#${to.startsWith('/') ? to : `/${to}`}`;
  if (opts?.replace) {
    const url = window.location.pathname + window.location.search + target;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
  // Scroll to top on navigation for a fresh-view feel.
  window.scrollTo({ top: 0 });
}

// ── <Link> ───────────────────────────────────────────────────────────────────────────────────────

interface LinkProps {
  to: string;
  className?: string;
  children: ReactNode;
  title?: string;
  'aria-label'?: string;
  activeClassName?: string;
  /** Match as active when the current path starts with `to` (for section links). */
  matchPrefix?: boolean;
}

export function Link({
  to,
  className,
  children,
  activeClassName,
  matchPrefix,
  ...rest
}: LinkProps) {
  const { path } = useLocation();
  const isActive = matchPrefix
    ? to === '/'
      ? path === '/'
      : path === to || path.startsWith(`${to}/`)
    : path === to;

  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigate(to);
    },
    [to]
  );

  const cls = [className, isActive ? activeClassName : ''].filter(Boolean).join(' ');
  return (
    <a href={`#${to}`} onClick={onClick} className={cls} aria-current={isActive ? 'page' : undefined} {...rest}>
      {children}
    </a>
  );
}

// ── helper: build a link path for entity/notebook/page ids (encode the id segment) ───────────────

export const routes = {
  dashboard: () => '/',
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : '/search'),
  notebooks: () => '/notebooks',
  notebook: (id: string) => `/notebooks/${encodeURIComponent(id)}`,
  page: (id: string) => `/pages/${encodeURIComponent(id)}`,
  openLoops: () => '/open-loops',
  entities: () => '/entities',
  entity: (name: string) => `/entities/${encodeURIComponent(name)}`,
};

/**
 * Match a `/a/:b` pattern against a path. Returns decoded params or null. Exported for the route
 * table in App.
 */
export function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const pParts = pattern.split('/').filter(Boolean);
  const aParts = path.split('/').filter(Boolean);
  if (pParts.length !== aParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pParts.length; i++) {
    const pp = pParts[i]!;
    const ap = aParts[i]!;
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(ap);
    } else if (pp !== ap) {
      return null;
    }
  }
  return params;
}

// ── search-focus keyboard shortcut plumbing ──────────────────────────────────────────────────────

type Listener = () => void;
const focusSearchListeners = new Set<Listener>();

/** Fire the global "focus the search box" intent (bound to `/`). */
export function requestSearchFocus(): void {
  focusSearchListeners.forEach((l) => l());
}

/** Subscribe a search input to the global focus intent. */
export function useSearchFocusListener(handler: Listener): void {
  useEffect(() => {
    focusSearchListeners.add(handler);
    return () => {
      focusSearchListeners.delete(handler);
    };
  }, [handler]);
}
