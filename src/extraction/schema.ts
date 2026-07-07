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
        description:
          'True if the page contains anything the user still needs to act on: a to-do or ' +
          'checklist, things to buy/get, a task, a reminder, a question, a "follow up on X", ' +
          'or an unresolved decision.',
      },
      open_loop_description: {
        type: 'string',
        description: 'Short summary of the outstanding item(s); empty if none.',
      },
    },
    required: ['extracted_text', 'page_type', 'entities', 'open_loop', 'open_loop_description'],
  },
} as const;

export const EXTRACTION_PROMPT =
  'Transcribe this handwritten reMarkable page to plain text and classify it. ' +
  'Preserve any dates exactly as written (e.g. "08/07"). ' +
  'Identify people, projects, companies, and topics as entities. ' +
  'Set open_loop=true if the page contains anything the user still needs to act on: a to-do or ' +
  'checklist, things to buy or get, a task, a reminder, a question, a "follow up on X", or an ' +
  'unresolved decision. Set open_loop=false only for purely informational or already-completed ' +
  'content (finished journaling, reference material). When open_loop is true, summarize the ' +
  'outstanding item(s) in open_loop_description. Respond by calling the record_page tool.';
