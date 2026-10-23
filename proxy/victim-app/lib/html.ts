const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
}

/**
 * Deliberately decodes HTML entities. The vulnerable renderer uses this before
 * dangerouslySetInnerHTML, which is what lets an entity-encoded payload slip
 * past request-only WAF rules. This is a demo sink, not a parser.
 */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number(dec)))
    .replace(/&([a-z0-9#]+);/gi, (match, name: string) => NAMED[name.toLowerCase()] ?? match)
}

function safeCodePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return ''
  try {
    return String.fromCodePoint(value)
  } catch {
    return ''
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
