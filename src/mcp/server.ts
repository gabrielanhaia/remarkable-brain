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

  const server = new McpServer({ name: 'rm-brain', version: '0.1.0' });

  server.tool(
    'search_notes',
    'Full-text search over notebook pages. Returns notebook name, page number, date, and a snippet.',
    { query: z.string(), limit: z.number().optional() },
    async (a) => text(h.search_notes(a))
  );
  server.tool(
    'get_page',
    'Get the full text and source image path for one page, for citing/showing the scanned page.',
    { page_id: z.string() },
    async (a) => text(h.get_page(a))
  );
  server.tool('list_notebooks', 'List indexed notebooks with page counts.', {}, async () =>
    text(h.list_notebooks())
  );
  server.tool(
    'get_entity_timeline',
    'All pages mentioning an entity, sorted chronologically, to narrate how thinking evolved.',
    { entity_name: z.string() },
    async (a) => text(h.get_entity_timeline(a))
  );
  server.tool(
    'get_open_loops',
    'Pages flagged as unresolved questions/follow-ups, most recent first.',
    { limit: z.number().optional() },
    async (a) => text(h.get_open_loops(a))
  );
  server.tool('list_entities', 'List auto-tagged entities with page counts.', {}, async () =>
    text(h.list_entities())
  );

  await server.connect(new StdioServerTransport());
}

startServer().catch((e) => {
  console.error(e);
  process.exit(1);
});
