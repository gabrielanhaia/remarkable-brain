# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security or privacy vulnerabilities.

Instead, report it privately via
[GitHub Security Advisories](https://github.com/gabrielanhaia/remarkable-brain/security/advisories/new),
or email the maintainer. You'll get an acknowledgement as soon as possible, and we'll work with
you on a fix and coordinated disclosure.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a minimal example if possible),
- affected version / commit.

## Data & privacy model

rm-brain is local-first by design. Understanding what it touches is part of its security story:

- **Stored locally only:** the SQLite database, page images, the change-detection manifest, and
  the config store (which may contain your `ANTHROPIC_API_KEY`) all live under `RM_BRAIN_HOME`
  (`~/.rm-brain` by default). The config store is written with `chmod 600`.
- **Leaves your machine only in two narrow cases:**
  1. Individual page images sent to the Anthropic API during `rm-brain sync` (extraction).
  2. Individual search queries and the snippets they return, exchanged with Claude Desktop over
     the local MCP connection while you search.
- **Cloud access is read-only.** rm-brain calls reMarkable via `rmapi` using only `list` /
  `stat` / `get`. It never uploads, edits, or deletes anything in your reMarkable account.
- **Opt-in scope.** Only notebooks inside your Brain folder are ever fetched; notebooks named
  `private`/`noindex`/dotted are skipped entirely.
- **No telemetry.** rm-brain sends no analytics or usage data anywhere.

## Secrets

- Your API key is read from the `ANTHROPIC_API_KEY` environment variable or the local config
  store — never hard-coded and never committed.
- `.gitignore` blocks `.env*` (except `.env.example`), `config.json`, `*.key`, `*.pem`, and the
  data home from being committed. If you contribute, double-check you're not adding secrets.

## Supported versions

This project is pre-1.0; security fixes are applied to the latest release/`main`.
