# How rm-brain uses AI

rm-brain uses AI in exactly **one place: indexing**. When you run `sync`, it reads each new page of
your handwriting with **Claude's vision model** and turns it into structured, searchable data.
After that, everything — searching, browsing, filtering — is plain local database work with **no AI
and no network**.

```
reMarkable Cloud ──► page image ──► Claude vision (1 call/page) ──► structured text ──► local SQLite
      (sync)                              indexing only                                   (private)
```

## What Claude extracts from each page

Each page image is sent to Claude once, with a tool schema that asks for a single structured
result (`record_page`):

- **`extracted_text`** — the handwriting transcribed to plain text. Claude vision handles messy
  handwriting and diagrams far better than traditional OCR, and preserves dates as written.
- **`page_type`** — a classification: `journal`, `meeting_notes`, `idea`, `decision`, `reference`,
  `diagram`, or `other`.
- **`entities`** — the people, projects, companies, topics, places, and events mentioned. Types are
  normalized to a fixed vocabulary so the same real thing isn't split across synonyms (e.g.
  "Location" and "Place" both become `place`).
- **`open_loop`** + **`open_loop_description`** — whether the page contains something you still need
  to act on (a to-do, a question, an unresolved decision), and a short summary of it.

This is what powers search, entity timelines, open-loop tracking, and page classification.

## Where your words are used after indexing

Once a page is indexed, the extracted text lives in your local database and becomes usable in two
ways:

1. **Local search** — keyword search over the text (see [How search works](search.md)). No AI.
2. **Conversation with Claude Desktop** — you ask questions in plain language and Claude answers
   using your notes, over MCP (see [How the MCP integration works](mcp.md)). The AI here is the
   Claude Desktop app you already use; rm-brain just hands it the relevant notes.

## What crosses the network, and what never does

rm-brain is **local-first**. The only things that ever leave your machine are:

- during `sync`: the **individual page image** being read, sent to the Claude API for extraction;
- during a Claude Desktop conversation: your **question** and the **snippets** Claude retrieves
  through MCP.

Everything else — the database, the page images, the search index, the manifest — stays in one
folder on your computer (`~/.rm-brain` by default). There is **no hosted service, no account, and
no telemetry**. reMarkable is only ever *read* (list / stat / get); nothing on your tablet is
modified, and no jailbreak is required.

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | required only for `sync` (extraction) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | the vision model used for extraction |

Changed the prompt or model? Run `rm-brain reindex` to re-extract every page.
