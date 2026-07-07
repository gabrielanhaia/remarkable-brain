# reMarkable Brain — Design Spec

**Date:** 2026-07-07
**Status:** Approved for planning

## 1. Summary

A local-first "second brain" that lets you search and explore your handwritten
reMarkable notebooks in natural language, answered through Claude Desktop. A
background sync pulls tagged pages from the reMarkable tablet, transcribes and
classifies the handwriting with the Claude API, and stores everything in a local
SQLite database. Queries happen as ordinary Claude Desktop conversations via an
MCP server — no separate chat UI, no hosted service, using the user's existing
Claude subscription.

Non-goals for v1 (deliberate): no vector DB / embeddings (FTS5 keyword search
only), no proactive notifications or digests, no auto-summarization dashboard,
no web UI.

## 2. Architecture & data flow

```
reMarkable Cloud
   │  rmapi  (list docs + read tags/metadata + export annotated PDF)
   ▼
Annotated PDF per document
   │  poppler (pdftoppm)
   ▼
Per-page PNG  ──(skip if page content hash unchanged)──►  Extraction module
                                                            │  Claude API,
                                                            │  1 vision call/page,
                                                            │  forced-tool JSON
                                                            ▼
                                                SQLite (better-sqlite3) + FTS5
                                                            ▲
                                                            │  read-only queries
                                                   MCP server ◄──► Claude Desktop
                                                            ▲
                                                   CLI (admin) ─┘  (search/list/purge/...)
```

Everything lives under `RM_BRAIN_HOME` (default `~/.rm-brain`):
`db.sqlite`, `images/`, `manifest.json`, `exclude` state.

**The only outbound network traffic, ever:**
(a) individual page PNGs sent to the Claude API during extraction, and
(b) individual queries + retrieved snippets sent through MCP during search.
The database, images, and manifest never leave the machine as a whole.

## 3. Interfaces (no web UI)

There are two surfaces; neither is a website:

1. **Claude Desktop** — the search/explore interface. The user talks to Claude
   in natural language; Claude silently calls the MCP tools and answers *with
   receipts* (notebook name, page number, date, and the scanned page image).
2. **Terminal CLI** — admin only: setup wizard, sync, doctor, list, exclude,
   purge, and a convenience `search`.

This is the core reason for the MCP approach: a world-class search/chat UI comes
for free from Claude Desktop instead of being built and maintained.

## 4. Inclusion / exclusion model — **opt-in, privacy-first**

**Only documents the user has explicitly tagged `#brain` on the tablet are
synced, extracted, or sent anywhere.** Nothing leaves the device by default.
The safe thing happens by accident; the risky thing requires a deliberate act.

On top of opt-in, a hard-exclusion override always wins: a document is skipped
entirely if its name matches `/^\./`, `/private/i`, or `/noindex/i`, even if it
also carries `#brain`. Checked *before* any download — excluded/untagged
documents never touch disk or network.

**Feasibility note & fallback:** tags live in the document cloud metadata. If the
installed `rmapi` surfaces tags, we use them. If it does not, the sync module
reads the document metadata JSON directly; if tags are unavailable entirely, we
fall back to a naming convention (`#brain` in the notebook name) and log a clear
warning. This is isolated in the sync module so the rest of the pipeline is
unaffected.

After-the-fact control from the terminal:
- `rm-brain exclude <notebook>` — sets `excluded`, blocks future syncs, **and
  purges** already-indexed pages, on-disk images, and FTS rows (not just "stops
  going forward").
- `rm-brain include <notebook>` — reverses it.

## 5. Module layout

Each module has one clear job, a well-defined interface, and is testable in
isolation.

```
src/
  config.ts        env loading + FIXED exclusion regexes (constants) + the #brain tag
  sync/
    rmapi.ts       thin wrapper over the rmapi CLI (list, tags/metadata, export annotated PDF)
    render.ts      PDF → per-page PNG via pdftoppm (poppler)
    manifest.ts    doc-id → content hash + per-page hashes (change detection)
    sync.ts        orchestrator: list → keep only #brain & not hard-excluded → detect changed → export → render
  extraction/
    extract.ts     ◄ THE ONLY module that calls an external API automatically
    schema.ts      structured-output tool schema + zod validation
  storage/
    db.ts          open, migrations, FTS5 setup + triggers
    repo.ts        typed CRUD + search / timeline / open-loops / purge
  mcp/server.ts    the MCP tools (no API key needed here)
  cli.ts           rm-brain command surface (uses @clack/prompts UI)
```

The extraction module is the sole holder of `ANTHROPIC_API_KEY` and the only
automatic external caller — isolated so that fact is obvious at a glance.

## 6. Change detection (only reprocess what changed)

Two-level, cheap-first:
- **Doc level:** reMarkable's document version/modified metadata → skip
  re-downloading unchanged documents.
- **Page level:** hash each rendered page PNG. A notebook that gained one page
  re-extracts only that page, never the whole document. Upserts are keyed by
  page id, so re-runs are idempotent and interrupted syncs resume cleanly.

`written_at` = the document's cloud modified time, applied to every page in that
document.

## 7. Extraction + classification (the only automatic external API call)

For each new/changed page PNG, a single Claude API vision call (default
`claude-sonnet-5`, override via `ANTHROPIC_MODEL`) using a **forced tool call**
returns one structured JSON object — never separate calls per field, to keep cost
and latency down:

- `extracted_text` — handwriting transcribed to plain text
- `page_type` — one of `journal | meeting_notes | idea | decision | reference | diagram | other`
- `entities` — array of `{ name, type }` (people / projects / companies / topics)
- `open_loop` — `boolean`
- `open_loop_description` — short text when `open_loop` is true (a question, a
  "follow up on X," or an unresolved decision not clearly resolved on the page)

Output validated with zod; on malformed output retry once, then skip the page
with a recorded error. Rationale for using Claude vision (not reMarkable's built-in
handwriting conversion): better on messy handwriting and diagrams.

## 8. Storage schema (SQLite + FTS5)

- `notebooks (id, name, excluded)`
- `pages (id, notebook_id, page_number, written_at, image_path, extracted_text,
   page_type, open_loop, open_loop_description, extracted_at, content_hash)`
- `entities (id, name, type)` — deduped by normalized `(name, type)`
- `page_entities (page_id, entity_id)` — join table powering entity views and
  cross-notebook auto-linking
- FTS5 virtual table mirroring `pages.extracted_text`, kept in sync via triggers

## 9. MCP tools (no API key required)

- `search_notes(query)` — FTS over `extracted_text`; returns matching pages with
  notebook name, page number, date, snippet
- `get_page(page_id)` — full text + path to source image, for citing/showing the
  actual scanned page
- `list_notebooks()` — browsing/debugging
- `get_entity_timeline(entity_name)` — all pages mentioning an entity, sorted
  chronologically, so Claude can narrate how thinking evolved
- `get_open_loops()` — pages flagged unresolved, most recent first ("what did I
  forget")
- `list_entities()` — browse what's been auto-tagged

## 10. CLI surface (beautiful terminal)

Built with `@clack/prompts` (interactive wizard/prompts/spinners), `picocolors`
(colors), `cli-table3` (tables).

- `rm-brain setup` — interactive wizard: pair rmapi, prompt for API key, print
  the exact Claude Desktop MCP config block to paste
- `rm-brain sync` — one sync+extract pass with live progress ("Rendering 3/12…
  Extracting…"), then exits
- `rm-brain search "query"` — same FTS search in the terminal (dev/quick lookups)
- `rm-brain list` — everything indexed: notebooks, page counts, excluded flags
- `rm-brain exclude <notebook>` / `include <notebook>` — after-the-fact
  exclusion (purges) / reversal
- `rm-brain purge` — delete the ENTIRE local index (DB + images), confirm-gated
- `rm-brain doctor` — verify rmapi, poppler, API key, home dir; report exactly
  what's missing
- `rm-brain mcp` — start the MCP server (this is what Claude Desktop launches)

## 11. Configuration (env vars, no hardcoded paths, no committed secrets)

- `RM_BRAIN_HOME` (default `~/.rm-brain`)
- `RMAPI_BIN` (default `rmapi` on PATH)
- `ANTHROPIC_API_KEY` (required only for `sync`/extraction; never committed)
- `ANTHROPIC_MODEL` (default `claude-sonnet-5`)

`.env.example` documents these; `.gitignore` excludes `.env` and any local data.

## 12. Error handling

Per-item resilience: rmapi/network failures and Claude API errors (429/5xx) are
retried with backoff, then that document/page is skipped, logged, and the run
continues — one bad page never aborts the sync. Progress is committed
incrementally so interrupted runs resume. Structured output is enforced via the
forced tool call + zod (retry once, else skip page with a recorded error).

## 13. Testing

Unit tests with **no live API calls** (the Claude client is injected/mockable):
- manifest diffing (new/changed/unchanged detection)
- inclusion (`#brain`) and hard-exclusion regex logic
- repo: search, entity timeline, open-loops, purge
- extraction schema validation against a canned response fixture

Plus a manual end-to-end test plan (below) run against one real, non-sensitive
notebook before pointing the tool at anything private.

## 14. Manual test plan (v1 acceptance)

1. `rm-brain doctor` — confirms rmapi, poppler, API key, home dir all green.
2. Tag one real, non-sensitive notebook `#brain` on the tablet; sync it to cloud.
3. `rm-brain sync` — watch it list only the tagged doc, export, render, extract.
4. `rm-brain list` — the notebook and its page count appear.
5. `rm-brain search "<a phrase you know is in it>"` — returns the right page(s)
   with notebook/page/date.
6. In Claude Desktop (MCP connected): ask a natural-language question about the
   notebook — confirm the answer cites notebook/page/date and can show the image.
7. Create an obvious open loop on a page ("TODO: follow up with X"), re-sync,
   then ask Claude "what open loops do I have" — confirm it surfaces.
8. `rm-brain exclude <notebook>` — confirm `list` shows it gone and the images
   are removed from `~/.rm-brain/images`.
9. Rename a second notebook to include `private`, tag it `#brain`, sync — confirm
   it is skipped (hard-exclusion wins over opt-in).
10. `rm-brain purge` — confirm the entire index and images are deleted.

## 15. Tech stack

- **Runtime/lang:** Node.js 20+, TypeScript, tsx/tsup for run/build
- **Pipeline:** better-sqlite3 (FTS5), @anthropic-ai/sdk (extraction only), zod
- **MCP:** @modelcontextprotocol/sdk
- **External tools (not npm):** rmapi (pair once), poppler / `pdftoppm`
  (`brew install poppler`)
- **Terminal UX:** @clack/prompts, picocolors, cli-table3
- **Testing/tooling:** vitest, Prettier, ESLint

## 16. Setup friction (documented honestly for OSS users)

Unavoidable one-time setup, minimized by the `setup` wizard + `doctor`:
1. Install Node + `npm install`
2. Pair rmapi to the reMarkable account (one-time code)
3. Provide an Anthropic API key (paid — the real cost)
4. Paste one MCP block into Claude Desktop config (wizard prints it)
5. `brew install poppler`
