import { readFileSync } from 'node:fs';
import {
  EXTRACTION_TOOL,
  EXTRACTION_PROMPT,
  PageExtractionSchema,
  normalizeEntityType,
  type PageExtraction,
} from './schema.js';

export interface AnthropicLike {
  messages: {
    create(args: Record<string, unknown>): Promise<{
      content: Array<{ type: string; name?: string; input?: unknown }>;
    }>;
  };
}

export async function createAnthropicClient(apiKey: string): Promise<AnthropicLike> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey }) as unknown as AnthropicLike;
}

export async function extractPage(opts: {
  imagePath: string;
  model: string;
  client: AnthropicLike;
}): Promise<PageExtraction> {
  const b64 = readFileSync(opts.imagePath).toString('base64');
  const request = {
    model: opts.model,
    max_tokens: 2048,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'record_page' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      },
    ],
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await opts.client.messages.create(request);
    const toolUse = res.content.find((c) => c.type === 'tool_use' && c.name === 'record_page');
    const parsed = PageExtractionSchema.safeParse(toolUse?.input);
    if (parsed.success) {
      // Canonicalize entity types onto the fixed vocabulary so the same real thing isn't split
      // across synonymous types (Location/Place, Item/Topic) into duplicate entities.
      return {
        ...parsed.data,
        entities: parsed.data.entities.map((e) => ({
          name: e.name.trim(),
          type: normalizeEntityType(e.type),
        })),
      };
    }
    lastErr = parsed.error;
  }
  throw new Error(`extraction returned invalid output: ${String(lastErr)}`);
}
