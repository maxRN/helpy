// The process name comes from what the expert says when Helpy asks "What are you going to show me?".
// Until then (or when nobody answers) a recording is "New recording"; the Work Map's task name replaces it later.

export const UNNAMED = 'New recording'

const FILLER = /^(?:okay|ok|so|well|um+|uh+|erm|yeah|yes|right|alright|sure)\b[,.!\s]*/i
const LEAD =
  /^(?:i(?:'m| am) (?:going to|gonna) (?:show|do)(?: you)?|i want to show(?: you)?|i(?:'ll| will) show(?: you)?|let me show(?: you)?|i(?:'m| am) showing(?: you)?|today i(?:'ll| will)?(?: show(?: you)?)?|i(?:'m| am) (?:going to|gonna)|i want to|i(?:'ll| will)|we(?:'re| are) going to)\s+/i
const HOW = /^(?:how (?:i|we|to|you)|the way (?:i|we))\s+/i

/** "Okay, I'm going to show you how I pay supplier invoices." -> "Pay supplier invoices". null when nothing is left. */
export function titleFromAnswer(answer: string, maxLength = 60): string | null {
  let t = answer.trim().replace(/[.!?…]+$/u, '')
  for (let i = 0; i < 3; i++) t = t.replace(FILLER, '')
  t = t.replace(LEAD, '').replace(HOW, '').trim()
  if (!t) return null
  if (t.length > maxLength) {
    const cut = t.slice(0, maxLength + 1)
    t = (cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut.slice(0, maxLength)).replace(/[,;:]+$/, '')
  }
  return t[0]!.toUpperCase() + t.slice(1)
}
