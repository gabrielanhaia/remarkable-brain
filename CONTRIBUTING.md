# Contributing to rm-brain

Thanks for your interest in improving rm-brain! This project is a local-first tool, so most
contributions can be developed and tested entirely on your machine without a reMarkable or an
API key (the external tools are mocked in tests).

## Getting set up

```bash
git clone https://github.com/gabrielanhaia/remarkable-brain.git
cd remarkable-brain
npm install
npm run check   # lint + typecheck + tests
```

## Project layout

```
src/
  config.ts        env/store config + opt-in folder + hard-exclusion rules
  store.ts         persisted config (~/.rm-brain/config.json), incl. the API key
  sync/
    rmapi.ts       thin wrapper over the rmapi CLI (list folder, stat, get)
    render.ts      .rmdoc → per-page PNG via rmc + rsvg-convert
    manifest.ts    change detection (doc modified time + per-page hashes)
    sync.ts        orchestrator: list → filter → download → render → extract → prune
  extraction/      the ONLY module that calls an external API automatically
  storage/         SQLite schema (FTS5) + typed repository
  mcp/             MCP server exposing read-only tools to Claude Desktop
  cli.ts           the `rm-brain` command surface (setup wizard, sync, search, …)
tests/             vitest unit tests — external tools & the Claude client are mocked
docs/              design spec + architecture notes
```

## Development workflow

- **Tests first.** This codebase follows TDD — add a failing test, then the implementation.
  Run `npm run test:watch` while you work.
- **No live API calls in tests.** The Anthropic client and the `rmapi`/`rmc` binaries are
  always injected/mocked. Keep it that way so CI stays hermetic and free.
- **Keep the extraction module the only automatic external caller.** It's the single place that
  holds the API key and talks to the Claude API — don't spread network calls elsewhere.
- **Respect the privacy model.** Cloud access is read-only; local data stays local; nothing is
  indexed outside the Brain folder.

## Before opening a PR

Run the full check locally — CI runs the same thing:

```bash
npm run check      # eslint + tsc --noEmit + vitest
npm run build      # make sure the bundle builds
```

- Keep PRs focused; one logical change per PR.
- Update docs (`README.md`, `ARCHITECTURE.md`) and `CHANGELOG.md` when behavior changes.
- Follow the existing code style (Prettier + ESLint enforce it — `npm run format`).

## Commit messages

Use short, conventional-ish prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
Example: `fix: sanitize FTS queries so a date like 08/07 doesn't crash search`.

## Reporting bugs & requesting features

Use the [issue templates](https://github.com/gabrielanhaia/remarkable-brain/issues/new/choose).
For anything security- or privacy-sensitive, follow [SECURITY.md](./SECURITY.md) instead of
opening a public issue.
