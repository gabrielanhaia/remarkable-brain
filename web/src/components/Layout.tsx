/** App shell: warm sidebar nav, persistent quick-search, and the global "/" focus shortcut. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Link,
  navigate,
  routes,
  useLocation,
  requestSearchFocus,
  useSearchFocusListener,
} from '../router.js';

interface NavItem {
  to: string;
  label: string;
  glyph: ReactNode;
}

const NAV: NavItem[] = [
  { to: routes.dashboard(), label: 'Dashboard', glyph: <GlyphGrid /> },
  { to: routes.search(), label: 'Search', glyph: <GlyphSearch /> },
  { to: routes.notebooks(), label: 'Notebooks', glyph: <GlyphBook /> },
  { to: routes.openLoops(), label: 'Open Loops', glyph: <GlyphLoop /> },
  { to: routes.entities(), label: 'Entities', glyph: <GlyphTag /> },
];

export function Layout({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [quick, setQuick] = useState('');

  // Global "/" focuses the quick-search box (unless typing in a field already).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      requestSearchFocus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useSearchFocusListener(
    useCallback(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    }, [])
  );

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  const submitQuick = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = quick.trim();
      navigate(q ? routes.search(q) : routes.search());
    },
    [quick]
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-ink-800 bg-ink-900/80 backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <Link to={routes.dashboard()} className="flex items-center gap-3 px-6 pb-6 pt-7">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-coral to-coral-deep font-display text-lg font-bold text-ink-950 shadow-glow">
              rm
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg text-ivory">rm-brain</span>
              <span className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-ivory-faint">
                second brain
              </span>
            </span>
          </Link>

          <nav className="flex-1 space-y-1 px-3">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                matchPrefix
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ivory-dim transition-colors hover:bg-ink-800 hover:text-ivory"
                activeClassName="!bg-coral/12 !text-coral-soft"
              >
                <span className="flex h-5 w-5 items-center justify-center text-current opacity-90">
                  {item.glyph}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-ink-800 px-6 py-5 text-[11px] leading-relaxed text-ivory-faint">
            <p className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
              Local · read-only
            </p>
            <p className="mt-1.5">
              Press <Kbd>/</Kbd> to search
            </p>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile drawer */}
      {navOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-ink-950/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-800 bg-ink-950/70 px-4 py-3 backdrop-blur-xl sm:px-6">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg border border-ink-700 p-2 text-ivory-dim hover:text-ivory lg:hidden"
          >
            <GlyphMenu />
          </button>

          <form onSubmit={submitQuick} className="relative flex-1 sm:max-w-md">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory-faint">
              <GlyphSearch />
            </span>
            <input
              ref={searchRef}
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              type="search"
              placeholder="Search your handwriting…"
              aria-label="Search notes"
              className="w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-10 text-sm text-ivory placeholder:text-ivory-faint transition-colors focus:border-coral/60 focus:outline-none focus:ring-1 focus:ring-coral/40"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:block">
              <Kbd>/</Kbd>
            </span>
          </form>

          <div className="ml-auto hidden text-xs text-ivory-faint sm:block">
            Asking questions? Use Claude Desktop.
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>

        <footer className="border-t border-ink-800 px-6 py-5 text-center text-xs text-ivory-faint">
          rm-brain · a private, local view of your reMarkable notes
        </footer>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-ivory-dim">
      {children}
    </kbd>
  );
}

// ── Inline stroke glyphs (no icon dependency; crisp at any size) ─────────────────────────────────

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      {children}
    </svg>
  );
}
function GlyphGrid() {
  return (
    <Svg>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  );
}
function GlyphSearch() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </Svg>
  );
}
function GlyphBook() {
  return (
    <Svg>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2z" />
      <path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H20" />
    </Svg>
  );
}
function GlyphLoop() {
  return (
    <Svg>
      <path d="M21 12a9 9 0 1 1-3.5-7.1" />
      <path d="M21 3v5h-5" />
    </Svg>
  );
}
function GlyphTag() {
  return (
    <Svg>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </Svg>
  );
}
function GlyphMenu() {
  return (
    <Svg>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}
