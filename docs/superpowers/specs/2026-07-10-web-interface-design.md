# rm-brain Web Interface — Design Spec

**Date:** 2026-07-10
**Status:** Approved for implementation

## 1. Summary

A local-first, **read-only** web application that is an alternative visual interface to rm-brain:
browse notebooks, view the actual scanned handwriting, and **search** your indexed notes from a
real web app in the browser. It complements — does not replace — the Claude Desktop/MCP
experience: **asking questions still happens in Claude Desktop**; the web app is for *seeing and
searching*. The search layer is architected so a future **semantic/vector** provider drops in
without changing the app.

Each user runs it on their own machine (`rm-brain web`) against their local index. Nothing new
leaves the machine.

## 2. Non-goals (explicit)

- **No AI ask/chat in the web app.** No Claude API calls from the web layer. Querying-by-asking
  stays in Claude Desktop over MCP.
- **No hosting / multi-tenant / auth / accounts.** Localhost, single user, their own data.
- **No writes/mutations** from the web app (no sync/exclude/purge). Admin stays in the CLI.
- **No embeddings in v1.** FTS keyword search ships now; vector is designed-for, not built.

## 3. Architecture

```
rm-brain web
   │  starts a local HTTP server bound to 127.0.0.1 (opens the browser)
   ▼
Node HTTP server
   ├── GET /api/*          JSON, read-only, over the existing better-sqlite3 Repo
   ├── GET /images/*       serves scanned page PNGs from RM_BRAIN_HOME/images
   └── GET /*              serves the prebuilt React SPA (static assets)
                                 ▼
                       Browser → http://localhost:4123  (React + Vite + Tailwind SPA)
```

- **Read-only & private:** binds `127.0.0.1` only, GET endpoints only, no auth (never exposed to
  the network). Same local-first guarantee as the rest of rm-brain.
- **Reuses everything:** the API is a thin layer over the existing `Repo` read methods
  (`searchNotes`, `getPage`, `listNotebooks`, `getEntityTimeline`, `getOpenLoops`,
  `listEntities`). No new data logic in v1 beyond the `SearchProvider` seam and a couple of
  overview aggregates.
- **Prebuilt frontend:** the SPA is built at publish time (`web/dist`) and served by the local
  server, so end users get a real app with **zero build step** — just `rm-brain web`.

## 4. Stack

- **Frontend:** React 19 + Vite + Tailwind CSS in a `web/` sub-project. TypeScript. Client-side
  routing. Polished, responsive, keyboard-navigable; the coral/ivory Claude-adjacent theme.
- **Server:** Node built-in `http` (small hand-rolled router — no framework needed), reusing
  `better-sqlite3` via `Repo`. Serves JSON, images, and the static SPA.
- **CLI command:** `rm-brain web [--port 4123] [--host 127.0.0.1] [--no-open]`.

## 5. HTTP API (read-only, all GET)

| Endpoint | Returns |
| --- | --- |
| `/api/overview` | counts (notebooks, pages, open loops, entities) + recent open loops + recently-written pages |
| `/api/notebooks` | `listNotebooks()` (excludes hidden) |
| `/api/notebooks/:id` | notebook meta + its pages (id, number, date, type, open_loop, thumbnail path) |
| `/api/pages/:id` | full `getPage()` (text, image path, type, entities, open-loop) |
| `/api/search?q=&notebook=&type=&open_loop=` | `SearchHit[]` via the active `SearchProvider`, with optional filters |
| `/api/open-loops?limit=` | `getOpenLoops()` |
| `/api/entities` | `listEntities()` |
| `/api/entities/:name/timeline` | `getEntityTimeline()` |
| `/images/:notebookId/:file` | the scanned page PNG (path-validated to `RM_BRAIN_HOME/images`) |

Errors return `{ error: string }` with the right status (404 for missing page/notebook, 400 for
bad params, 503 with a friendly "run `rm-brain sync` first" when the DB/tables are empty/missing).

## 6. Search architecture — built for the vector future

Search sits behind an interface so the provider can evolve without touching the API or SPA:

```ts
interface SearchProvider {
  search(query: string, filters?: SearchFilters): SearchHit[];
}
```

- **v1 ships `FtsSearchProvider`** — wraps `repo.searchNotes` (+ applies notebook/type/open_loop
  filters). This is the default.
- **Documented future `SemanticSearchProvider`** — local embeddings (e.g. `sqlite-vec`) with
  hybrid keyword+vector ranking. Selected via config/env later; the API endpoint and the SPA
  stay identical. No architecture change required to adopt it.

## 7. Views (search is first-class)

- **Search** (the headline feature): a prominent search box → results as **page thumbnails +
  snippet + notebook name/date**, with filters (notebook, page type, open-loop only). Empty and
  no-results states.
- **Dashboard / Overview:** stat tiles (notebooks, pages, open loops, entities) + recent open
  loops + recently-written pages.
- **Notebooks:** a grid of notebooks → open one → its pages as **thumbnails of the real
  handwriting**.
- **Page detail:** the full scanned image side-by-side with the transcribed text, page type,
  linked entities, and an open-loop badge.
- **Open Loops:** the "what did I forget" list, most recent first, each linking to its page.
- **Entities:** browse people/projects/topics → open one for its **chronological timeline**
  across notebooks.

Global: left nav, dark coral/ivory theme, responsive, keyboard shortcut to focus search.

## 8. Data flow & errors

Browser → SPA (fetch) → JSON API → `Repo` (SQLite) / image files on disk. Entirely local. The
server never mutates. If `RM_BRAIN_HOME/db.sqlite` is missing or has no pages, every page of the
SPA shows a friendly "No notes indexed yet — run `rm-brain sync`" state instead of erroring.

## 9. Packaging & build

- `web/` is a Vite project; `npm run build` (root) builds the CLI **and** the web bundle into
  `web/dist`.
- The server resolves `web/dist` relative to the package and serves it. The `files` field ships
  `web/dist` in the npm package.
- Dev convenience: `web/` has its own `dev` script (Vite dev server proxying `/api` to a running
  `rm-brain web`) for frontend iteration.

## 10. Testing

- **API handlers:** unit-tested against an in-memory SQLite `Repo` (mirrors the MCP tools tests)
  — each endpoint's happy path + error path.
- **Server:** a boot smoke test (starts on an ephemeral port, `GET /api/overview` returns 200).
- **SearchProvider:** unit tests for `FtsSearchProvider` incl. filters.
- **Frontend:** the Vite build must pass in CI; a lightweight Playwright smoke test (load app,
  run a search, open a page) is optional/stretch.
- CI (`.github/workflows/ci.yml`) extended to build the web bundle.

## 11. Privacy & safety

Localhost-only bind, read-only, no auth surface, no telemetry, no outbound network from the web
layer. The image endpoint validates/normalizes paths to stay within `RM_BRAIN_HOME/images` (no
path traversal). Consistent with rm-brain's existing guarantees.
