# Architecture

rm-brain is a small pipeline plus an MCP server, all local. This document explains how the
pieces fit together and why.

## Data flow

```
reMarkable Cloud
   │  rmapi  (find the Brain folder → stat each doc → get the .rmdoc)
   ▼
.rmdoc archive (zip of .rm v6 vector files + .content page order)
   │  unzip → read cPages page order
   ▼
per-page .rm  ──rmc──►  SVG  ──rsvg-convert──►  page PNG
   │  (blank pages are skipped)
   ▼
Extraction (Claude vision, ONE forced-tool call per page)
   │  → { extracted_text, page_type, entities[], open_loop, open_loop_description }
   ▼
SQLite (better-sqlite3) + FTS5
   ▲
   │  read-only queries
MCP server  ◄──────────────►  Claude Desktop
   ▲
CLI (admin: sync, search, backup, …)
```

Everything lives under `RM_BRAIN_HOME` (default `~/.rm-brain`): `db.sqlite`, `images/`,
`manifest.json`, and `config.json` (the store).

## Why these tools

- **rmapi (ddvk `sync15`)** — reMarkable's newer cloud sync protocol (SyncVersion 1.5) rejects
  the original `juruen/rmapi` with HTTP 410. The ddvk fork implements it.
- **rmc + rsvg-convert** — reMarkable notebooks are `.rm` v6 vector files, not PDFs. `rmapi`'s
  own `geta` (annotated-PDF export) can't render pure handwritten notebooks. `rmc` converts
  `.rm` v6 → SVG reliably, and `rsvg-convert` rasterizes to PNG.
- **Claude vision for extraction** — chosen over reMarkable's built-in handwriting conversion
  because it handles messy handwriting and diagrams better, and classifies + extracts entities
  and open loops in the same call.

## Module boundaries

Each module has one job and a well-defined interface, so it can be understood and tested in
isolation.

| Module | Responsibility |
| --- | --- |
| `config.ts` / `store.ts` | Resolve config (env > store > default); Brain-folder + hard-exclusion rules |
| `sync/rmapi.ts` | Thin wrapper over the `rmapi` CLI — list folder, stat, download |
| `sync/render.ts` | `.rmdoc` → ordered per-page PNGs via `rmc` + `rsvg-convert` |
| `sync/manifest.ts` | Change detection (doc modified time + per-page content hashes) |
| `sync/sync.ts` | Orchestrator: list → filter → download → render → extract → **prune** |
| `extraction/` | **The only module that calls an external API automatically** |
| `storage/` | SQLite schema (FTS5) + a typed repository |
| `mcp/` | MCP server exposing read-only query tools to Claude Desktop |
| `web/` | Local read-only HTTP server + JSON API over the `Repo`, serving a prebuilt React SPA |
| `cli.ts` | The `rm-brain` command surface + setup wizard |

The **extraction module is deliberately the sole automatic external caller** and the only holder
of the API key, so that fact is obvious at a glance and easy to audit.

## Change detection

Two levels, cheap-first, so only new/changed work happens:

1. **Document level** — reMarkable's `ModifiedClient` timestamp is the change signal. (Its
   `Version` field is pinned at `0` under the new sync protocol, so it's useless for this.)
   Unchanged documents are never re-downloaded.
2. **Page level** — each rendered PNG is hashed. A notebook that gained one page re-extracts
   only that page. Upserts are keyed by page id, so re-runs are idempotent and interrupted syncs
   resume cleanly.

`rm-brain reindex` clears the manifest to force a full re-extraction (e.g. after changing the
extraction prompt or model).

## Pruning (folder as source of truth)

After a sync, any indexed notebook that's no longer in the Brain folder is removed — its pages,
on-disk images, and manifest entry. User-created exclusion markers are preserved.

## Storage schema

- `notebooks(id, name, excluded)`
- `pages(id, notebook_id, page_number, written_at, image_path, extracted_text, page_type,
   open_loop, open_loop_description, extracted_at, content_hash)`
- `entities(id, name, type)` — deduped by `(name, type)`
- `page_entities(page_id, entity_id)` — powers entity views and cross-notebook linking
- `pages_fts` — FTS5 virtual table mirroring `extracted_text`, kept in sync via triggers

Search input is sanitized into a safe FTS5 `MATCH` expression (quoted tokens) so punctuation
like `/` or `:` in a query can't cause a syntax error.

## Error handling

Per-item resilience: network/rmapi failures and Claude API errors are retried, then that
doc/page is skipped and logged — one bad page never aborts a sync. Progress is committed per
document so an interrupted run resumes. Structured extraction output is validated with zod and
retried once before the page is skipped.

## Web interface

`rm-brain web` starts a small Node `http` server (no framework) bound to `127.0.0.1`, serving
three things: a read-only JSON API under `/api/*`, the scanned page PNGs under `/images/*`
(paths validated to stay inside `RM_BRAIN_HOME/images`), and the prebuilt React SPA for
everything else. The API is a thin layer over the same `Repo` read methods the MCP tools use —
no duplicated data logic and, like MCP, strictly read-only (GET only, no mutations, no auth, no
outbound network).

Search sits behind a `SearchProvider` seam: v1 ships `FtsSearchProvider` (wrapping
`repo.searchNotes` plus notebook/type/open-loop filters), and a future
`SemanticSearchProvider` (local vector embeddings) can drop in without touching the HTTP API or
the SPA. The frontend is a React + Vite + Tailwind app in `web/`, built to `web/dist` at build
time and shipped in the npm package, so end users get a real app with zero build step. See
[the web interface design spec](./docs/superpowers/specs/2026-07-10-web-interface-design.md) for
the full design.

## Design docs

The original brainstorming spec and implementation plan live under
[`docs/superpowers/`](./docs/superpowers/).
