import { z } from 'zod';

export const PAGE_TYPES = [
  'journal',
  'meeting_notes',
  'idea',
  'decision',
  'reference',
  'diagram',
  'other',
] as const;

export const PageExtractionSchema = z.object({
  extracted_text: z.string(),
  page_type: z.enum(PAGE_TYPES),
  entities: z.array(z.object({ name: z.string(), type: z.string() })).default([]),
  open_loop: z.boolean(),
  open_loop_description: z.string().default(''),
});
export type PageExtraction = z.infer<typeof PageExtractionSchema>;

export const EXTRACTION_TOOL = {
  name: 'record_page',
  description:
    'Record the transcription and classification of a single handwritten reMarkable page.',
  input_schema: {
    type: 'object' as const,
    properties: {
      extracted_text: { type: 'string', description: 'The handwriting transcribed to plain text.' },
      page_type: { type: 'string', enum: PAGE_TYPES },
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, type: { type: 'string' } },
          required: ['name', 'type'],
        },
      },
      open_loop: {
        type: 'boolean',
        description: 'True if the page poses an unresolved question or follow-up.',
      },
      open_loop_description: {
        type: 'string',
        description: 'Short description of the open loop, empty if none.',
      },
    },
    required: ['extracted_text', 'page_type', 'entities', 'open_loop', 'open_loop_description'],
  },
} as const;

export const EXTRACTION_PROMPT =
  'Transcribe this handwritten reMarkable page to plain text and classify it. ' +
  'Identify people, projects, companies, and topics as entities. ' +
  'Set open_loop=true only if the page poses a question, a "follow up on X", or an unresolved decision ' +
  'that is not clearly resolved on the page itself. Respond by calling the record_page tool.';
