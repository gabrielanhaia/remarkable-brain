/**
 * App shell + client-side route table. Hash-based routing (see router.tsx) keeps the prebuilt SPA
 * working under the local server's relative base with a plain index.html fallback.
 */
import { Layout } from './components/Layout.js';
import { matchPattern, routes, useLocation, Link } from './router.js';
import { Dashboard } from './views/Dashboard.js';
import { Search } from './views/Search.js';
import { Notebooks } from './views/Notebooks.js';
import { NotebookDetail } from './views/NotebookDetail.js';
import { PageDetail } from './views/PageDetail.js';
import { OpenLoops } from './views/OpenLoops.js';
import { Entities } from './views/Entities.js';
import { EntityTimeline } from './views/EntityTimeline.js';

export default function App() {
  const { path } = useLocation();
  return <Layout>{renderRoute(path)}</Layout>;
}

function renderRoute(path: string) {
  if (path === '/' || path === '') return <Dashboard />;
  if (path === '/search') return <Search />;
  if (path === '/notebooks') return <Notebooks />;
  if (path === '/open-loops') return <OpenLoops />;
  if (path === '/entities') return <Entities />;

  const nb = matchPattern('/notebooks/:id', path);
  if (nb?.id) return <NotebookDetail key={nb.id} id={nb.id} />;

  const pg = matchPattern('/pages/:id', path);
  if (pg?.id) return <PageDetail key={pg.id} id={pg.id} />;

  const ent = matchPattern('/entities/:name', path);
  if (ent?.name) return <EntityTimeline key={ent.name} name={ent.name} />;

  return <NotFound />;
}

function NotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="font-display text-6xl font-bold text-pen">404</div>
      <p className="mt-3 font-display text-xl font-semibold text-ink">This page isn’t here</p>
      <p className="mt-1.5 text-muted">The link may be stale or mistyped.</p>
      <Link
        to={routes.dashboard()}
        className="mt-6 rounded-md border border-line bg-sheet px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-pen/50 hover:text-pen"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
