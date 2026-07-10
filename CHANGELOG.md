# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-10

### Added

- **Web interface** (`rm-brain web`) — a local-first, read-only web app to **browse and search**
  your indexed notes and view the actual scanned handwriting in the browser. It complements the
  Claude Desktop experience (asking questions still happens there over MCP); the web app is for
  seeing and searching. A small Node `http` server binds `127.0.0.1` only and serves a read-only
  JSON API over the existing `Repo`, the scanned page images (path-validated), and a **prebuilt**
  React + Vite + Tailwind SPA — so end users get a real app with zero build step. Views: Dashboard,
  Search (with notebook/type/open-loop filters), Notebooks, Page detail, Open Loops, and Entity
  timelines. Search sits behind a `SearchProvider` seam (v1 `FtsSearchProvider`) so a future
  semantic/vector provider can drop in without changing the API or the frontend. Flags:
  `--port` / `--host` / `--no-open`. No auth, no telemetry, no outbound network from the web layer.
- **"Fine writing tool" web design** — a fountain-pen-ink-on-fine-paper visual system with
  self-hosted Newsreader/Geist typefaces (SIL OFL), a token layer that switches with the OS
  light/dark preference, and scans that always render as light paper with dark ink so handwriting
  never inverts into invisibility.
- **Typo-tolerant, partial-word search** — every query token matches as a prefix (`meet` →
  meeting), and if a query finds nothing a fuzzy fallback expands each token to indexed
  vocabulary terms within a small edit distance (`meetign` → meeting). Works in the web app and
  the `search` CLI.
- **Subfolder support** — each notebook records its reMarkable subfolder; the Notebooks view
  groups notebooks by folder.
- Footer credit and a GitHub link in the web app.

### Changed

- **Entity de-duplication** — entity types are normalized onto a fixed vocabulary
  (person/project/company/topic/place/event/other) at extraction, and the Entities list groups by
  name, so the same real thing no longer appears as multiple cards (e.g. "Location" vs "Place").

### Fixed

- Re-indexing a page now **replaces** its entity links instead of accumulating them, so an entity
  dropped from a fresh extraction stops appearing on the page and in its timeline.
- Pages deleted **inside** a notebook are now pruned (rows, images, manifest) on the next sync,
  guarded so a failed render can never wipe a notebook.
- Hard-exclusion now applies to every folder segment, so documents under a
  `private`/`noindex`/dotfolder **subfolder** are skipped too, not just top-level ones.

## [0.1.0] - 2026-07-09

Initial release.

### Added

- **Sync pipeline** — pulls notebooks from a reMarkable *Brain* folder via `rmapi` (ddvk
  `sync15`), renders `.rm` v6 pages to PNG with `rmc` + `rsvg-convert`, and extracts each page
  with a single Claude vision call (transcription, page type, entities, open loops).
- **Folder-based opt-in with pruning** — only notebooks inside the Brain folder are indexed;
  removing a notebook from the folder prunes it (pages + images) on the next sync.
- **Local SQLite storage** with FTS5 full-text search; everything lives under `~/.rm-brain`.
- **MCP server** exposing read-only tools to Claude Desktop: `search_notes`, `get_page`,
  `list_notebooks`, `get_entity_timeline`, `get_open_loops`, `list_entities` — with proactive
  usage instructions.
- **Interactive setup wizard** (`rm-brain setup`) — checks tools, pairs rmapi, saves the API
  key to a chmod-600 store, detects Brain-folder notebooks, runs the first sync, and wires
  Claude Desktop.
- **CLI**: `sync`, `reindex`, `search`, `list`, `info`, `backup`, `exclude`/`include`, `purge`,
  `doctor`, `mcp`.
- **Privacy guarantees** — read-only cloud access, hard-exclusion by name (`private`/`noindex`/
  dotfiles), local-only storage, no telemetry.

[Unreleased]: https://github.com/gabrielanhaia/remarkable-brain/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/gabrielanhaia/remarkable-brain/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/gabrielanhaia/remarkable-brain/releases/tag/v0.1.0
