import type { Repo } from '../storage/repo.js';

export function buildToolHandlers(repo: Repo) {
  return {
    search_notes: ({ query, limit }: { query: string; limit?: number }) => ({
      results: repo.searchNotes(query, limit),
    }),
    get_page: ({ page_id }: { page_id: string }) => {
      const p = repo.getPage(page_id);
      return p ? { ...p } : { error: 'not found' };
    },
    list_notebooks: () => ({ results: repo.listNotebooks() }),
    get_entity_timeline: ({ entity_name }: { entity_name: string }) => ({
      results: repo.getEntityTimeline(entity_name),
    }),
    get_open_loops: ({ limit }: { limit?: number }) => ({ results: repo.getOpenLoops(limit) }),
    list_entities: () => ({ results: repo.listEntities() }),
  };
}
