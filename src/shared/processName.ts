// Process names for "Recorded processes": short and scannable, like "Approve Supplier Invoice".
// Used for every generated name (the expert's spoken answer, the Work Map's task) on the client and
// the server, so a verbose model output or a long sentence never becomes a huge title.

export const PROCESS_NAME_MAX = 48
const MAX_WORDS = 5

// Lead-ins that carry no meaning in a title ("Process for …", "How I …", "Ich zeige dir, wie …").
const LEAD_INS = [
  /^(?:the\s+)?(?:process|procedure|workflow|steps?)\s+(?:for|of|to)\s+/i,
  /^how\s+(?:i|we|you|to)\s+/i,
  /^(?:the\s+)?way\s+(?:i|we)\s+/i,
  /^(?:ich\s+(?:zeige|zeig)\s+(?:dir|ihnen|euch)(?:\s+heute)?|heute\s+zeige\s+ich\s+(?:dir|ihnen|euch))[,\s]+(?:wie\s+(?:ich|man|wir)\s+)?/i,
  /^wie\s+(?:ich|man|wir)\s+/i,
]
// A title stops before an explanation starts.
const CLAUSE = /\s*(?:[,;:(]|\s[-–—]\s|\s(?:because|so that|which|that is|in order to|so i|weil|damit|sodass)\s).*$/i
const ARTICLES = new Set(['a', 'an', 'the', 'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einen'])
const SMALL = new Set(['and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'before', 'after', 'from', 'per', 'und', 'oder', 'für', 'vor', 'nach', 'mit', 'von', 'im', 'am'])

const capitalize = (w: string) => w.replace(/^\p{Ll}/u, (c) => c.toUpperCase())

/**
 * "Process for supplier invoices before the September close, because Kramer bills twice" ->
 * "Supplier Invoices Before September Close". At most 5 meaningful words and 48 characters,
 * no lead-in, no explanation, no articles. Returns '' when nothing is left.
 */
export function conciseProcessName(raw: string): string {
  let t = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”„‚‘’]+|["'“”„‚‘’]+$/gu, '')
    .replace(/[.!?…]+$/u, '')
    .trim()
  for (const lead of LEAD_INS) t = t.replace(lead, '')
  t = t.replace(CLAUSE, '').trim()

  let words = t.split(' ').filter((w) => w && !ARTICLES.has(w.toLowerCase()))
  words = words.slice(0, MAX_WORDS)
  // No title ends on "before", "and", "for", …
  while (words.length > 1 && SMALL.has(words[words.length - 1]!.toLowerCase())) words.pop()

  let title = words.map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : capitalize(w))).join(' ')
  if (title.length > PROCESS_NAME_MAX) {
    const cut = title.slice(0, PROCESS_NAME_MAX + 1)
    title = cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut.slice(0, PROCESS_NAME_MAX)
    const parts = title.split(' ')
    while (parts.length > 1 && SMALL.has(parts[parts.length - 1]!.toLowerCase())) parts.pop()
    title = parts.join(' ')
  }
  return title.replace(/[,;:–—-]+$/u, '').trim()
}
