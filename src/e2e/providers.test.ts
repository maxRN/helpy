// Tests A, B and C against a deployed app with real providers (Claude, ElevenLabs). Skipped unless
// E2E_BASE_URL is set, e.g. E2E_BASE_URL=https://<railway-preview> npx vitest run src/e2e
// It calls the same API routes the browser does, with a realistic session log, and checks the outcome.
// Never prints secrets: only statuses, timings and generated text.
import { describe, expect, it } from 'vitest'
import { isDuplicateQuestion } from '../agent/coverage'
import { evaluateGuardrails } from '../erp/guardrails'
import { TEACH_INVOICE } from '../erp/seed'
import type { LogLine } from '../server/debrief'
import type { Guardrail, WorkMap } from '../shared/types'

const BASE = process.env.E2E_BASE_URL?.replace(/\/$/, '')
const timings: Record<string, number> = {}

async function call<T>(name: string, path: string, body?: unknown): Promise<T> {
  const started = Date.now()
  const res = await fetch(`${BASE}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  timings[name] = Date.now() - started
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text().catch(() => '')}`)
  return (res.headers.get('content-type') ?? '').includes('json') ? ((await res.json()) as T) : (undefined as T)
}

const LIVE_1 = 'You moved that one to capex. What made you do that?'
const LIVE_2 = 'You held the Kramer invoice. Why that one?'
const log: LogLine[] = [
  { t: 12_000, who: 'expert', text: 'Okay, I am coding this week’s supplier invoices.' },
  { t: 30_000, who: 'screen', text: 'Opened invoice 4471 from Neckartal Werkzeugmaschinen GmbH (€6,800.00, equipment)' },
  { t: 41_000, who: 'screen', text: 'Invoice 4471: cost center 4711 Production – Maintenance (opex) → 0400 Capital Equipment (capex)' },
  { t: 52_000, who: 'screen', text: 'Invoice 4471: asset number (empty) → A-2026-118' },
  { t: 58_000, who: 'agent', text: LIVE_1 },
  { t: 61_000, who: 'expert', text: 'Equipment over five thousand is always capex. And no asset number, no capex booking. Never.' },
  { t: 70_000, who: 'screen', text: 'Invoice 4471: posted' },
  { t: 90_000, who: 'screen', text: 'Opened invoice 4472 from Kramer Industriebedarf GmbH (€1,240.00, raw_materials)' },
  { t: 104_000, who: 'screen', text: 'Invoice 4472: put on hold (note: "Kramer double-bills at quarter-end")' },
  { t: 140_000, who: 'agent', text: LIVE_2 },
  { t: 143_000, who: 'expert', text: 'Kramer bills us twice at every quarter-end, so I hold it and Weber releases it.' },
  { t: 160_000, who: 'screen', text: 'Opened invoice 4473 from Hartmann Machine Works s.r.o. (Brno) (€3,900.00, intercompany)' },
  { t: 171_000, who: 'screen', text: 'Invoice 4473: sent for a second approval' },
  { t: 175_000, who: 'expert', text: 'Anything from Brno gets a second pair of eyes.' },
]

describe.skipIf(!BASE)('real providers (Tests A, B, C)', () => {
  it('voice services answer: agent sessions, Scribe token, TTS', async () => {
    for (const agent of ['interviewer', 'tutor']) await call(`signed-url ${agent}`, `/api/elevenlabs/signed-url?agent=${agent}`)
    await call('scribe-token', '/api/elevenlabs/scribe-token')
    await call('tts', '/api/tts', { text: 'You moved that one to capex. What made you do that?' })
  }, 30_000)

  it('Test A: an owed live question at the end is asked, grounded in an unexplained decision, as a guardrail', async () => {
    const events = [{ id: 'e-hold', t: 104_000, text: 'Invoice 4472: put on hold (note: "Kramer double-bills at quarter-end")' }, { id: 'e-brno', t: 171_000, text: 'Invoice 4473: sent for a second approval' }]
    const res = await call<{ ask: boolean; question?: string; eventId?: string; kind?: string }>('policy (must ask)', '/api/policy', {
      events,
      history: [{ question: LIVE_1, kind: 'why', t: 58_000, answer: 'Equipment over five thousand is always capex.' }],
      transcriptTail: [{ speaker: 'expert', text: 'And that one goes to Novak.' }],
      budget: { questionsLeft: 4, forceGuardrail: true },
      coverage: { questionsNeeded: 2, guardrailNeeded: true, unresolvedDecisions: events, mustAsk: true },
      language: 'en',
    })
    console.info('[e2e] Test A question:', res.question, `(${res.kind}, ${timings['policy (must ask)']} ms)`)
    expect(res.ask).toBe(true)
    expect(res.kind).toBe('guardrail')
    expect(events.map((e) => e.id)).toContain(res.eventId)
    expect(isDuplicateQuestion(res.question!, [{ question: LIVE_1 }])).toBe(false)
  }, 30_000)

  let workMap: WorkMap
  it('Test B: at least three new debrief questions, a stated reason, and a Work Map whose rules link to screen moments', async () => {
    const asked: { question: string; answered: boolean }[] = []
    const answers = [
      'Only Kramer, at every quarter-end. Weber in controlling releases it after checking the duplicate.',
      'If a supplier is not in the vendor master, I do not pay. I hold it and ask Weber.',
      'Anything over five thousand from Brno needs Novak too, smaller ones just the normal approval.',
      'Nothing else comes to mind.',
    ]
    let session = [...log]
    let doneReason = ''
    for (let round = 0; round < 4; round++) {
      const res = await call<{ gaps: { question: string }[]; done: boolean; doneReason: string; required: number; live: { question: string }[] }>(`gaps round ${round + 1}`, '/api/debrief/gaps', { log: session, asked })
      expect(res.live.map((q) => q.question)).toEqual([LIVE_1, LIVE_2])
      if (asked.length < 3) expect(res.done).toBe(false)
      if (res.done) {
        doneReason = res.doneReason
        break
      }
      for (const g of res.gaps) {
        expect(isDuplicateQuestion(g.question, [{ question: LIVE_1 }, { question: LIVE_2 }, ...asked])).toBe(false)
        const answer = answers[asked.length] ?? 'Nothing else.'
        session = [...session, { t: 300_000 + asked.length * 20_000, who: 'agent', text: g.question }, { t: 304_000 + asked.length * 20_000, who: 'expert', text: answer }]
        asked.push({ question: g.question, answered: true })
        console.info('[e2e] Test B debrief question:', g.question)
      }
    }
    console.info('[e2e] Test B done reason:', doneReason)
    expect(asked.length).toBeGreaterThanOrEqual(3)

    const correction = 'No, Kramer is held at every quarter-end, not only in December.'
    session = [...session, { t: 420_000, who: 'expert', text: correction }]
    workMap = (await call<{ workMap: WorkMap }>('workmap', '/api/workmap', { sessionId: 'e2e', log: session, corrections: [correction] })).workMap
    const teachback = await call<{ text: string }>('teachback', '/api/debrief/teachback', { workMap })
    console.info('[e2e] Test B teach-back:', teachback.text)
    expect(teachback.text.length).toBeGreaterThan(40)
    expect(workMap.steps.length).toBeGreaterThanOrEqual(3)
    expect(workMap.guardrails.length).toBeGreaterThanOrEqual(2)
    // Every step and every rule said during the task links to a real screen moment from the log.
    const screenTimes = new Set(session.filter((l) => l.who === 'screen').map((l) => l.t))
    for (const s of workMap.steps) if (s.moment) expect(screenTimes).toContain(s.moment.t)
    const live = workMap.guardrails.filter((g) => g.quote.via === 'live_question' || g.quote.via === 'narration')
    expect(live.length).toBeGreaterThan(0)
    for (const g of live) expect(g.moment && screenTimes.has(g.moment.t)).toBe(true)
    console.info('[e2e] Work Map:', workMap.steps.length, 'steps,', workMap.guardrails.length, 'rules:', workMap.guardrails.map((g) => `${g.id} ${g.text} [${g.quote.via}, ${g.moment ? g.moment.t : 'no moment'}]`).join(' | '))
  }, 300_000)

  it('Test C: the rules compiled from Sabine’s words stop the €7,200 opex case and let the fixed one through', async () => {
    expect(workMap).toBeDefined()
    const { guardrails } = await call<{ guardrails: Guardrail[] }>('compile', '/api/guardrails/compile', { guardrails: workMap.guardrails })
    const wrong = evaluateGuardrails(TEACH_INVOICE, guardrails).filter((v) => v.guardrail.severity === 'block')
    console.info('[e2e] Test C stops 5102 as opex with:', wrong.map((v) => `${v.guardrail.id} "${v.guardrail.quote.text}"`).join(' | '))
    expect(wrong.length).toBeGreaterThan(0)
    expect(wrong.some((v) => /capex/i.test(v.guardrail.text))).toBe(true)
    const fixed = { ...TEACH_INVOICE, costCenter: '0400', account: 'capex' as const, assetNumber: 'A-2026-131' }
    expect(evaluateGuardrails(fixed, guardrails).filter((v) => v.guardrail.severity === 'block')).toEqual([])
    console.info('[e2e] timings (ms):', JSON.stringify(timings))
  }, 120_000)
})
