// Test B of the brief, end to end without audio: the real server logic (gaps, Work Map, teach-back) with the
// model stubbed, driven by the same flow the spoken debrief runs.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogLine } from '../server/debrief'

const generateJson = vi.fn()
vi.mock('../server/anthropic', () => ({ generateJson: (...args: unknown[]) => generateJson(...args), MODELS: { deep: 'm', policy: 'm' } }))

const { buildWorkMap, findGaps, writeTeachback } = await import('../server/debrief')
const { runDebriefFlow } = await import('./debriefFlow')
const { workMapMarkdown } = await import('../integration/voiceBridge')

const LIVE_1 = 'You moved that one to capex. What made you do that?'
const LIVE_2 = 'You held the Kramer invoice. Why that one?'
const CORRECTION = 'No, Kramer is held at every quarter-end, not only in December.'

const baseLog: LogLine[] = [
  { t: 30_000, who: 'screen', text: 'Opened invoice 4471 from Neckartal Werkzeugmaschinen GmbH (€6,800.00, equipment)' },
  { t: 41_000, who: 'screen', text: 'Invoice 4471: cost center 4711 → 0400 (capex)' },
  { t: 45_000, who: 'agent', text: LIVE_1 },
  { t: 48_000, who: 'expert', text: 'Equipment over five thousand is always capex.' },
  { t: 90_000, who: 'screen', text: 'Invoice 4472: put on hold' },
  { t: 95_000, who: 'agent', text: LIVE_2 },
  { t: 99_000, who: 'expert', text: 'Kramer bills us twice, so I hold it.' },
  { t: 140_000, who: 'screen', text: 'Invoice 4473: sent for a second approval' },
]

type Draft = Parameters<typeof buildWorkMap>[1]
let log: Draft
let gapRounds: Array<Record<string, unknown>>
let workMapCalls: string[]

const draft = (quote: string) => ({
  task: 'Code Supplier Invoices',
  steps: [
    { title: 'Code the cost center', targetId: 'field-costCenter', startT: 40_000, endT: 52_000, decision: 'Re-coded to capex', reasonQuote: 'Equipment over five thousand is always capex.', isJudgmentCall: true, confidence: 0.9, guardrailIds: ['G1'] },
    { title: 'Hold Kramer at quarter-end', targetId: 'action-hold', startT: 88_000, endT: 100_000, decision: 'Kramer put on hold', reasonQuote: '', isJudgmentCall: true, confidence: 0.8, guardrailIds: ['G2'] },
  ],
  guardrails: [
    { id: 'G1', text: 'Equipment over €5,000 is capex.', quote: 'Equipment over five thousand is always capex.' },
    { id: 'G2', text: 'Hold Kramer invoices at quarter-end.', quote },
  ],
  openQuestions: [],
})

beforeEach(() => {
  log = [...baseLog]
  workMapCalls = []
  generateJson.mockReset()
  generateJson.mockImplementation(async ({ system, content }: { system: string; content: string }) => {
    if (system.startsWith('You run the debrief')) return gapRounds.shift() ?? { gaps: [], done: true, doneReason: '' }
    if (system.startsWith('You turn an apprentice')) {
      workMapCalls.push(content)
      return draft(content.includes(CORRECTION) ? CORRECTION : 'Kramer bills us twice, so I hold it.')
    }
    return { text: 'You open the invoice, code equipment over five thousand as capex and hold Kramer.' }
  })
})

function io(over: Partial<Parameters<typeof runDebriefFlow>[0]> = {}) {
  const asked: string[] = []
  const said: string[] = []
  const flow: Parameters<typeof runDebriefFlow>[0] = {
    sessionId: 's1',
    log: async () => log,
    post: async <T,>(url: string, body: any): Promise<T> => {
      if (url === '/api/debrief/gaps') return (await findGaps(body.log, body.asked)) as T
      if (url === '/api/workmap') return (await buildWorkMap(body.sessionId, body.log, 'Sabine', body.corrections)) as T
      return { text: await writeTeachback(body.workMap) } as T
    },
    ask: async (q) => {
      asked.push(q)
      log = [...log, { t: 200_000 + asked.length * 10_000, who: 'agent', text: q }, { t: 203_000 + asked.length * 10_000, who: 'expert', text: `Answer ${asked.length}.` }]
      return `Answer ${asked.length}.`
    },
    teachBack: async () => ({ confirmed: true }),
    say: async (t) => void said.push(t),
    waitForQuiet: async () => undefined,
    stopped: () => false,
    grounded: () => true,
    scrub: (t) => t,
    now: () => 300_000,
    phase: () => undefined,
    ...over,
  }
  return { flow, asked, said }
}

describe('debrief (Test B)', () => {
  it('asks at least three new questions even when the model says it is done early, never a live question again', async () => {
    gapRounds = [
      // Round 1: the model repeats a live question and wants to stop after one new question.
      { gaps: [{ question: LIVE_1, kind: 'why', aboutT: 41_000 }, { question: 'Is the Kramer hold for every quarter-end or only December?', kind: 'exception', aboutT: 90_000 }], done: true, doneReason: 'All clear.' },
      // Its retry adds one more new question; a grounded fallback question fills the third.
      { gaps: [{ question: 'Who decides when a held Kramer invoice is released?', kind: 'guardrail', aboutT: 90_000 }], done: false, doneReason: '' },
      // Round 2 (three asked): the model may end now, with its reason.
      { gaps: [], done: true, doneReason: 'I think I understand it now: every decision has a reason and you told me who releases a hold.' },
    ]
    const { flow, asked, said } = io()
    const out = await runDebriefFlow(flow)

    expect(out.kind).toBe('done')
    if (out.kind !== 'done') return
    expect(asked.length).toBeGreaterThanOrEqual(3)
    expect(new Set(asked).size).toBe(asked.length)
    expect(asked).not.toContain(LIVE_1)
    expect(asked).not.toContain(LIVE_2)
    // The state shows which questions were asked and answered, and the live questions it did not repeat.
    expect(out.workMap.debrief?.questions.map((q) => q.status)).toEqual(asked.map(() => 'answered'))
    expect(out.workMap.debrief?.live.map((q) => q.question)).toEqual([LIVE_1, LIVE_2])
    expect(out.workMap.debrief?.live.every((q) => q.answered)).toBe(true)
    // The server's reason is spoken and stored, not discarded.
    const reason = 'I think I understand it now: every decision has a reason and you told me who releases a hold.'
    expect(said).toContain(reason)
    expect(out.workMap.debrief?.doneReason).toBe(reason)
    expect(out.workMap.teachback).toMatchObject({ confirmed: true, rounds: 1 })
    expect(out.workMap.teachback?.confirmedAt).toBeTypeOf('number')
  })

  it('a correction rebuilds the Work Map, is told back again, and reaches the tutor', async () => {
    gapRounds = [
      { gaps: [1, 2, 3].map((i) => ({ question: `New question number ${i} about ${['exceptions', 'limits', 'suppliers'][i - 1]}?`, kind: 'exception', aboutT: 90_000 })), done: false, doneReason: '' },
      { gaps: [], done: true, doneReason: 'I have what I need.' },
    ]
    const verdicts = [{ confirmed: false, correction: CORRECTION }, { confirmed: true }]
    const { flow } = io({
      teachBack: async () => {
        const v = verdicts.shift()!
        // The voice layer logs the correction as the expert's own words (teachback_result).
        if (v.correction) log = [...log, { t: 400_000, who: 'expert', text: v.correction }]
        return v
      },
    })
    const out = await runDebriefFlow(flow)
    if (out.kind !== 'done') throw new Error(out.kind)

    expect(workMapCalls).toHaveLength(2)
    expect(workMapCalls[1]).toContain(CORRECTION) // the rebuild is told what was wrong
    expect(out.workMap.teachback).toMatchObject({ confirmed: true, rounds: 2, corrections: [{ text: CORRECTION, speaker: 'expert' }] })
    const g2 = out.workMap.guardrails.find((g) => g.id === 'G2')
    expect(g2?.quote).toMatchObject({ text: CORRECTION, t: 400_000 })
    expect(workMapMarkdown(out.workMap)).toContain(CORRECTION) // what the tutor loads in Teach
  })

  it('does not count an unanswered teach-back as confirmed', async () => {
    gapRounds = [
      { gaps: [1, 2, 3].map((i) => ({ question: `Different question ${i} on ${['holds', 'approvals', 'limits'][i - 1]}?`, kind: 'guardrail', aboutT: 41_000 })), done: false, doneReason: '' },
      { gaps: [], done: true, doneReason: 'Covered.' },
    ]
    const { flow } = io({ teachBack: async () => ({ confirmed: false, correction: '(no response)' }) })
    const out = await runDebriefFlow(flow)
    if (out.kind !== 'done') throw new Error(out.kind)
    expect(out.confirmed).toBe(false)
    expect(out.workMap.teachback?.confirmed).toBe(false)
    expect(out.workMap.teachback?.confirmedAt).toBeUndefined()
  })

  it('records a skipped question as skipped', async () => {
    gapRounds = [
      { gaps: [1, 2, 3].map((i) => ({ question: `Separate question ${i} on ${['holds', 'approvals', 'limits'][i - 1]}?`, kind: 'why', aboutT: 41_000 })), done: false, doneReason: '' },
      { gaps: [], done: true, doneReason: 'Covered.' },
    ]
    const { flow } = io({ ask: async () => null })
    const out = await runDebriefFlow(flow)
    if (out.kind !== 'done') throw new Error(out.kind)
    expect(out.workMap.debrief?.questions.map((q) => q.status)).toEqual(['skipped', 'skipped', 'skipped'])
  })
})
