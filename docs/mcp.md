# How the MCP integration works

rm-brain lets you **search and explore your notes as a normal conversation in Claude Desktop** —
no separate app to learn. This works through the
[Model Context Protocol (MCP)](https://modelcontextprotocol.io), an open standard that lets an AI
app like Claude Desktop call external "tools."

## The idea

```
You ─ask in plain language─► Claude Desktop ─calls tools over MCP─► rm-brain MCP server ─► local SQLite
                                    ▲                                                          │
                                    └──────────── answer with citations ◄─────────────────────┘
```

rm-brain ships a small **MCP server** (`rm-brain mcp`). Claude Desktop launches it automatically at
startup and keeps it running. When you ask Claude something about your notes, Claude decides to call
one of rm-brain's tools; the server answers from your **local** database; and Claude turns that into
a reply with citations (notebook, page number, date) so you can verify it.

## The tools rm-brain exposes

All tools are **read-only** — the server can never modify or delete your notes.

| Tool | What it does |
| --- | --- |
| `search_notes` | Full-text search across every indexed page (see [How search works](search.md)) |
| `get_page` | Fetch one page's transcription, type, entities, and open-loop status |
| `list_notebooks` | List indexed notebooks and their page counts |
| `get_entity_timeline` | Every page that mentions a person / project / topic, in order |
| `get_open_loops` | Unfinished threads — to-dos, questions, unresolved decisions |
| `list_entities` | The recurring people, projects, and topics across your notebooks |

The server also sends Claude **connect-time instructions** so it proactively reaches for your notes
when you ask about your tasks, plans, or ideas.

## What you can ask

Because Claude picks the right tool for you, you just talk normally:

- *"What are my open loops?"* / *"What did I forget to follow up on?"*
- *"What did I decide about the pricing model?"*
- *"How has my thinking on the onboarding flow evolved?"* (entity timeline)
- *"Show me the page where I sketched the architecture."*

## Setup

`rm-brain setup` can write the Claude Desktop config for you (it adds an entry that runs
`rm-brain mcp`). You can also add it by hand — see the
[Claude Desktop MCP docs](https://modelcontextprotocol.io/quickstart/user).

> **After any rm-brain update, fully quit Claude Desktop (⌘Q, not just close the window) and reopen
> it** — Claude Desktop starts the MCP server once at launch, so it needs a restart to pick up a new
> version.

## Privacy

The MCP server runs **on your machine** and reads your **local** database. The only things that go
over the network during a conversation are your question and the snippets Claude retrieves to answer
it — the same data you'd be reading yourself. See [How rm-brain uses AI](how-ai-works.md).
