/** Presentation helpers: dates, page-type labels, entity glyphs. Pure, no side effects. */

/** Human date like "Jul 7, 2026". Falls back to a dash for null/unparseable input. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Relative-ish label ("Today", "Yesterday", "3 days ago", else the date). */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Undated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Undated';
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return `${days} days ago`;
  if (days < 0) return formatDate(iso);
  return formatDate(iso);
}

/** Title-case a page type slug like "meeting_notes" → "Meeting Notes". */
export function formatPageType(type: string | null | undefined): string | null {
  if (!type) return null;
  return type
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A small glyph for an entity type, used as a leading marker. */
export function entityGlyph(type: string | null | undefined): string {
  switch ((type ?? '').toLowerCase()) {
    case 'person':
    case 'people':
      return '◆';
    case 'project':
      return '▲';
    case 'topic':
      return '●';
    case 'organization':
    case 'org':
      return '■';
    case 'place':
    case 'location':
      return '◈';
    default:
      return '·';
  }
}

/** Pluralize a noun by count: (1, "page") → "1 page". */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`;
}
