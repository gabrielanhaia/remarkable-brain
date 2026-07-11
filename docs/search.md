# How search works

rm-brain's search is **100% local** — nothing leaves your machine when you search. There are no
network calls and no AI API calls at search time. It runs the same way in three places:

- the terminal: `rm-brain search "<query>"`
- the web app: the Search view (and the `/` quick-search)
- Claude Desktop: the `search_notes` MCP tool

All three call one function (`Repo.searchNotes`) over a local SQLite database, so they behave
identically.

## The index

During `sync`, each page's handwriting is transcribed to plain text (see
[How rm-brain uses AI](how-ai-works.md)) and stored in SQLite. The text is indexed with
[SQLite FTS5](https://sqlite.org/fts5.html), a full-text search engine built into SQLite. Searching
is a local query against that index — fast, offline, and private.

## What "forgiving search" means

A handwritten note is messy, and so is the way people search it. rm-brain tries hard to find the
page you mean even when the query isn't exact:

| You type… | It still finds… | How |
| --- | --- | --- |
| **Any word order** — "API Alex" | "Talk to **Alex** about the **API**" | tokens are matched with implicit AND; order doesn't matter |
| **Partial words** — "portug" | "**Portug**al" | prefix matching (`portug*`) |
| **Word forms** — "meeting" | "**meetings**", "meet" | stemming (see below) |
| **Small typos** — "meetign" | "**meeting**" | fuzzy fallback (see below) |

### Word forms (stemming)

The main index uses the **Porter stemmer**, which reduces words to a common root
(`meeting`, `meetings`, `meet` → `meet`; `run`, `running`, `runs` → `run`). Because both the
indexed text and your query are stemmed the same way, grammatical variants match **in both
directions** — searching "meeting" finds "meetings", and searching "running" finds "run".

### Typos (fuzzy fallback)

If the exact/prefix query finds nothing, rm-brain falls back to a **fuzzy** pass: it compares each
of your query words against the actual words in your notes (an unstemmed vocabulary) and keeps the
ones within a small [edit distance](https://en.wikipedia.org/wiki/Levenshtein_distance) — so
"portgual" still finds "Portugal". The distance budget scales with word length (longer words
tolerate more), which keeps short words from matching everything.

> **Why two indexes?** Stemming is great for word forms but bad for typo-matching (a typo of
> "meeting" is closer to the whole word than to the stem "meet"). So rm-brain keeps two FTS
> indexes over the same text: a **stemmed** one for word forms, and an **unstemmed** one that feeds
> the fuzzy vocabulary. You get accurate results from both behaviors at once.

## Filters

Search can be narrowed by **notebook**, **page type** (journal / meeting / idea / decision / …),
and **open-loops-only**. In the web app these are the controls under the search box; over MCP they
are tool parameters.

## Ranking

Results are ranked by FTS5's built-in **BM25** relevance, most relevant first, and each result
carries its provenance — notebook, page number, date, and a highlighted snippet.

## Extensible by design (semantic search)

Search sits behind a small `SearchProvider` interface. The shipped provider is keyword-based
(everything above). A **local semantic** provider — matching by *meaning* using on-device
embeddings, with no API calls at search time — can drop in behind the same interface without
changing the web app or the MCP tools. See the roadmap in the [README](../README.md).
