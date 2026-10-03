// Questions for the debrief. P3's POST /api/debrief/gaps finds them in the session;
// until that route exists, the example questions below match the example Work Map.
import type { Gap, WorkMap } from '../../shared/types'

export const EXAMPLE_GAPS: Gap[] = [
  {
    id: 'Q1',
    stepId: 'S5',
    clip: { start: 257_000, end: 273_000 },
    kind: 'exception',
    question: 'You held the Kramer invoice. Is that for every supplier in December, and who decides when to release it?',
  },
  {
    id: 'Q2',
    stepId: 'S3',
    clip: { start: 184_000, end: 200_000 },
    kind: 'guardrail',
    question: 'You moved the Midwest invoice to capex. Is five thousand dollars the exact line, and does shipping count toward it?',
  },
  {
    id: 'Q3',
    stepId: 'S4',
    clip: { start: 193_000, end: 209_000 },
    kind: 'guardrail',
    question: 'Is there ever a case where you would post equipment without an asset number?',
  },
  {
    id: 'Q4',
    clip: { start: 600_000, end: 616_000 },
    kind: 'unseen_case',
    question: 'What would you do with an invoice from a supplier that is not in the vendor master yet?',
  },
]

/** Asks P3's route for the gaps of this session; falls back to the example questions. */
export async function loadGaps(sessionId: string): Promise<{ gaps: Gap[]; example: boolean }> {
  try {
    const res = await fetch('/api/debrief/gaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    if (!res.ok) throw new Error(String(res.status))
    const body = (await res.json()) as { gaps?: Gap[] }
    if (body.gaps?.length) return { gaps: body.gaps, example: false }
  } catch {
    // Route not there yet: use the examples.
  }
  return { gaps: EXAMPLE_GAPS, example: true }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Helpy explains the process back in plain words, using the expert's own reasons for the judgment calls. */
export function teachbackText(wm: WorkMap): string {
  const steps = [...wm.steps].sort((a, b) => a.index - b.index)
  const parts = steps.map((s, i) => {
    const lead = i === 0 ? 'First you' : i === steps.length - 1 ? 'Finally you' : 'Then you'
    const why = s.isJudgmentCall && s.reason ? `, because “${s.reason.text.replace(/[.!?]+$/, '')}”` : ''
    return `${lead} ${lowerFirst(s.title)}${why}.`
  })
  return `Here is how I understood it. ${parts.join(' ')} Did I get that right?`
}
