import { expect, test, vi } from 'vitest';
import { extractPage } from '../src/extraction/extract.js';
import { PageExtractionSchema } from '../src/extraction/schema.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function pngFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rmb-img-'));
  const p = join(dir, 'page.png');
  // 1x1 transparent PNG
  writeFileSync(
    p,
    Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
      'hex'
    )
  );
  return p;
}

test('extractPage sends a vision + forced-tool request and validates output', async () => {
  const toolResult = {
    extracted_text: 'Discussed Ordio pricing',
    page_type: 'meeting_notes',
    entities: [{ name: 'Ordio', type: 'company' }],
    open_loop: true,
    open_loop_description: 'follow up on pricing',
  };
  const client = {
    messages: {
      create: vi
        .fn()
        .mockResolvedValue({ content: [{ type: 'tool_use', name: 'record_page', input: toolResult }] }),
    },
  };
  const out = await extractPage({ imagePath: pngFixture(), model: 'claude-sonnet-5', client });
  expect(client.messages.create).toHaveBeenCalledOnce();
  const arg = client.messages.create.mock.calls[0]![0] as any;
  expect(arg.model).toBe('claude-sonnet-5');
  expect(arg.tool_choice).toEqual({ type: 'tool', name: 'record_page' });
  expect(arg.messages[0].content.some((c: any) => c.type === 'image')).toBe(true);
  expect(() => PageExtractionSchema.parse(out)).not.toThrow();
  expect(out.entities[0]!.name).toBe('Ordio');
});

test('extractPage retries once on invalid output then throws', async () => {
  const client = {
    messages: {
      create: vi
        .fn()
        .mockResolvedValue({ content: [{ type: 'tool_use', name: 'record_page', input: { bogus: true } }] }),
    },
  };
  await expect(extractPage({ imagePath: pngFixture(), model: 'm', client })).rejects.toThrow();
  expect(client.messages.create).toHaveBeenCalledTimes(2);
});
