#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolveConfig } from '../config.js';
import { openDb, migrate } from '../storage/db.js';
import { Repo } from '../storage/repo.js';
import { buildToolHandlers } from './tools.js';

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

export async function startServer(): Promise<void> {
  const cfg = resolveConfig();
  mkdirSync(cfg.home, { recursive: true });
  const db = openDb(cfg.dbPath);
  migrate(db);
  const repo = new Repo(db);
  const h = buildToolHandlers(repo);

  const server = new McpServer(
    { name: 'rm-brain', version: '0.1.0' },
    {
      instructions: [
        'rm-brain is the user’s personal "second brain" built from their own handwritten',
        'reMarkable notebooks. Treat it as an authoritative source about the user’s life,',
        'work, plans, and thinking.',
        '',
        'Use these tools PROACTIVELY — without being asked to "check my notes" — whenever the',
        'user asks about anything they might have written down: tasks, to-dos, plans, reminders,',
        'meetings, decisions, ideas, follow-ups, open questions, or what they thought/wrote about',
        'a person, project, or topic. If a question is about the user’s own tasks or plans',
        '(e.g. "what do I have to do on Saturday?"), search the notes FIRST, before answering',
        'from memory or other tools.',
        '',
        'Start with search_notes for a topic, or get_open_loops for outstanding tasks/follow-ups.',
        'Always cite the notebook name, page number, and date, and offer the scanned page image',
        '(via get_page) when relevant. Prefer note-grounded answers over general knowledge for',
        'anything about the user personally.',
      ].join('\n'),
    }
  );

  server.tool(
    'search_notes',
    'Search the user’s handwritten reMarkable notes (full text). Use for any question about ' +
      'what the user wrote, planned, decided, or noted on a topic, person, or project. Returns ' +
      'notebook name, page number, date, and a snippet.',
    { query: z.string(), limit: z.number().optional() },
    async (a) => text(h.search_notes(a))
  );
  server.tool(
    'get_page',
    'Get the full text and source image path for one page, for citing or showing the scanned page.',
    { page_id: z.string() },
    async (a) => text(h.get_page(a))
  );
  server.tool('list_notebooks', 'List the user’s indexed notebooks with page counts.', {}, async () =>
    text(h.list_notebooks())
  );
  server.tool(
    'get_entity_timeline',
    'Every page mentioning a person, project, company, or topic, in chronological order — use to ' +
      'narrate how the user’s thinking on something evolved over time.',
    { entity_name: z.string() },
    async (a) => text(h.get_entity_timeline(a))
  );
  server.tool(
    'get_open_loops',
    'The user’s outstanding tasks, to-dos, follow-ups, and unresolved questions from their ' +
      'notes, most recent first. Use for "what do I need to do", "what did I forget", "any open items".',
    { limit: z.number().optional() },
    async (a) => text(h.get_open_loops(a))
  );
  server.tool('list_entities', 'List people, projects, companies, and topics found across the notes.', {}, async () =>
    text(h.list_entities())
  );

  await server.connect(new StdioServerTransport());
}

startServer().catch((e) => {
  console.error(e);
  process.exit(1);
});
