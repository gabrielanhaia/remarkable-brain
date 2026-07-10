# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/gabrielanhaia/remarkable-brain/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gabrielanhaia/remarkable-brain/releases/tag/v0.1.0
