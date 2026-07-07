# rm-brain

A local-first "second brain" for your handwritten **reMarkable** notebooks. It quietly
syncs the notebooks you tag `#brain`, transcribes and classifies the handwriting with
the Claude API, and stores everything in a local SQLite database. You then **search and
explore it as an ordinary conversation in Claude Desktop** — no separate app, no hosted
service, using your existing Claude subscription.

> Ask *"what did I decide about Ordio pricing?"* or *"what open loops have I been ignoring?"*
> and Claude answers with receipts: notebook name, page number, date, and the scanned page.

## How it works

```
reMarkable Cloud
   │  rmapi (list the Brain folder + stat + get)
   ▼
.rmdoc archive  ──rmc──►  per-page SVG  ──rsvg-convert──►  page PNGs
                                                              │  Extraction (Claude vision, 1 call/page)
                                                              ▼
                                                 SQLite + FTS5  ◄──►  MCP server  ◄──►  Claude Desktop
```

reMarkable notebooks are stored as proprietary `.rm` v6 vector files (not PDFs), so the
renderer is [`rmc`](https://github.com/ricklupton/rmc) (SVG) + `rsvg-convert` (PNG) rather
than a PDF rasterizer.

## What data goes where

Everything lives in **one portable folder**, `RM_BRAIN_HOME` (default `~/.rm-brain`):

- `db.sqlite` — notebooks, pages, transcribed text (FTS5 index), entities
- `images/` — one PNG per page, for citations
- `manifest.json` — content hashes so only new/changed pages get reprocessed

**The only things that ever leave your machine** are (a) individual page images sent to
the Claude API during `sync`, and (b) individual queries + retrieved snippets sent through
MCP while you search in Claude Desktop. The database, images, and manifest never leave as
a whole.

### Portability & backup

Because the whole index is that one self-contained folder:

- **Back up:** `rm-brain backup [dest.tar.gz]` writes a clean, portable snapshot. Or just
  copy `~/.rm-brain`.
- **Restore / move machines:** extract the archive anywhere and point `RM_BRAIN_HOME` at it.
- **Auto-backup / roam:** set `RM_BRAIN_HOME` to a Dropbox/iCloud/Syncthing folder and it
  backs itself up continuously.
- `rm-brain info` shows exactly where the data lives and how big it is.

## Privacy model — opt-in by folder

- **Nothing is indexed unless you put the notebook in your Brain folder.** Create a folder
  named `Brain` (case-insensitive; configurable via `RM_BRAIN_FOLDER`) on the tablet and move
  notebooks into it. The safe default is "do nothing"; indexing a notebook requires a
  deliberate move.
- **The folder is the source of truth.** Remove a notebook from the folder (or delete it) and
  the next `sync` **prunes it** from your local index — pages and images included.
- **Hard exclusion always wins:** a notebook whose name matches `/^\./`, `/private/i`, or
  `/noindex/i` is skipped entirely — never exported, extracted, or sent anywhere — even inside
  the Brain folder.
- `rm-brain exclude "<name>"` excludes a notebook after the fact **and purges** its already
  indexed pages and images (and keeps it excluded on future syncs).
- `rm-brain purge` deletes the entire local index.

## Prerequisites

- **Node.js 20+**
- **rmapi** — reMarkable Cloud CLI. Use the **[`ddvk/rmapi`](https://github.com/ddvk/rmapi)
  `sync15` build** (grab a release binary or build the `sync15` branch). reMarkable's newer
  cloud sync protocol returns HTTP 410 with older rmapi builds. Pair it once (it prompts for
  a one-time code from <https://my.remarkable.com/device/desktop/connect>).
- **rmc** — renders `.rm` v6 pages: `pipx install rmc`
- **librsvg** (`rsvg-convert`): `brew install librsvg`
- **Anthropic API key** — used only during `sync` for handwriting extraction.

> **Safety note:** rm-brain only ever *reads* from your reMarkable cloud (`find`/`stat`/`get`).
> It never uploads or modifies anything, so the metadata-corruption issues reMarkable has
> attributed to rmapi *writes* don't apply here. Your notebooks stay untouched on the device
> and in reMarkable's own cloud.

## Install

```bash
npm install
npm run build
npm link   # optional: puts `rm-brain` on your PATH
```

## Setup

One command does it all — run it and follow the prompts:

```bash
rm-brain setup
```

The wizard checks your tools, pairs rmapi if needed, **prompts for your Anthropic API key
once and saves it** to `~/.rm-brain/config.json` (chmod 600, so you never re-`export` it),
helps you opt a notebook in, detects it, offers to run the first sync, and can write your
Claude Desktop config automatically. Re-run it anytime — it's idempotent.

Prefer to wire Claude Desktop by hand? The MCP block looks like this — paste it into
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) and restart Claude
Desktop:

```json
{
  "mcpServers": {
    "rm-brain": { "command": "rm-brain", "args": ["mcp"], "env": { "RM_BRAIN_HOME": "/Users/you/.rm-brain" } }
  }
}
```

## Usage

1. On the tablet, move a notebook into your `Brain` folder (and let it sync to the reMarkable cloud).
2. Index it:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   rm-brain sync
   ```
3. Ask Claude Desktop about your notes in plain language.

### CLI reference

| Command | What it does |
| --- | --- |
| `rm-brain setup` | Interactive setup wizard; prints the Claude Desktop config |
| `rm-brain sync` | Pull `#brain` notebooks, render, extract, index |
| `rm-brain search "<query>"` | Full-text search from the terminal |
| `rm-brain list` | Show indexed notebooks and page counts |
| `rm-brain info` | Where the data lives + stats |
| `rm-brain backup [dest]` | Write a portable `.tar.gz` of the whole index |
| `rm-brain exclude "<name>"` / `include "<name>"` | Exclude (purges) / re-include a notebook |
| `rm-brain purge` | Delete the entire local index |
| `rm-brain doctor` | Check dependencies |
| `rm-brain mcp` | Start the MCP server (Claude Desktop runs this) |

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `RM_BRAIN_HOME` | `~/.rm-brain` | Where all local data lives |
| `RM_BRAIN_FOLDER` | `/Brain` | reMarkable folder whose notebooks get indexed (case-insensitive) |
| `RMAPI_BIN` | `rmapi` | Path/name of the rmapi binary (ddvk sync15 build) |
| `RMC_BIN` | `rmc` | Path/name of the rmc renderer |
| `RSVG_BIN` | `rsvg-convert` | Path/name of rsvg-convert (SVG→PNG) |
| `ANTHROPIC_API_KEY` | — | Required only for `sync` (extraction) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Vision model for extraction |

## Cost

`sync` makes **one** Claude vision call per new or changed page (change detection means
unchanged pages are never reprocessed). Pick a cheaper or stronger model via
`ANTHROPIC_MODEL`.

## A note on tags

Tag support depends on your installed `rmapi` surfacing document tags. If it can't, tagged
documents look untagged and are simply skipped (fail-safe — nothing is sent). In that case,
put `#brain` in the notebook's **name** instead, or upgrade rmapi.

## Not in v1 (on purpose)

No vector search / embeddings (FTS5 keyword search only), no notifications or daily digests,
no summary dashboard, no web UI. This stays a tool you reach for, not one that reaches for you.

## License

MIT
