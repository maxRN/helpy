import { describe, expect, it, vi } from 'vitest'
import type { LogLine } from './debrief'

const generateJson = vi.fn()
vi.mock('./anthropic', () => ({ generateJson: (...args: unknown[]) => generateJson(...args), MODELS: { deep: 'claude-opus-5-5' } }))

const { buildWorkMap, clipAround, findExpertQuote, findGaps, MAX_DEBRIEF_QUESTIONS, NotEnoughWorkError } = await import('./debrief')

const log: LogLine[] = [
  { t: 30_000, who: 'screen', text: 'Opened invoice 4471 from Neckartal Werkzeugmaschinen GmbH (€6,800.00, equipment)' },
  { t: 41_000, who: 'screen', text: 'Invoice 4471: cost center 4711 → 0400 (capex)' },
  { t: 52_000, who: 'agent', text: 'What made you do that?' },
  { t: 55_000, who: 'expert', text: "Equipment over five thousand is always capex. That's our policy." },
  { t: 60_000, who: 'screen', text: 'Invoice 4471: posted' },
]

const chatter: LogLine[] = [
  { t: 30_000, who: 'screen', text: 'Opened invoice 4458 from Rhein-Neckar Spedition GmbH (€1,840.00, services)' },
  { t: 48_000, who: 'expert', text: 'Ist das dein Whisper Flow? Nein, das ist ElevenLabs.' },
  { t: 58_000, who: 'expert', text: 'Willst du nicht wissen, ob es funktioniert?' },
]

describe('findExpertQuote', () => {
  it('finds what the expert said, ignoring case and punctuation', () => {
    expect(findExpertQuote(log, 'equipment over five thousand is always capex')).toEqual({
      text: 'equipment over five thousand is always capex',
      t: 55_000,
      speaker: 'expert',
    })
  })

  it('rejects invented quotes and words the agent said', () => {
    expect(findExpertQuote(log, 'Equipment over ten thousand is capex')).toBeNull()
    expect(findExpertQuote(log, 'What made you do that')).toBeNull()
  })
})

describe('clipAround', () => {
  it('gives 8 s before and after, never before the start', () => {
    expect(clipAround(41_000)).toEqual({ start: 33_000, end: 49_000 })
    expect(clipAround(3_000)).toEqual({ start: 0, end: 11_000 })
  })
})

describe('not enough work on screen', () => {
  it('says so instead of asking or writing a Work Map, without calling the model', async () => {
    generateJson.mockClear()
    const gaps = await findGaps(chatter, 0)
    expect(gaps).toMatchObject({ done: true, notEnoughWork: true, gaps: [] })
    await expect(buildWorkMap('s1', chatter)).rejects.toBeInstanceOf(NotEnoughWorkError)
    expect(generateJson).not.toHaveBeenCalled()
  })
})

describe('findGaps', () => {
  it('stops asking once the question budget is used, without calling the model', async () => {
    generateJson.mockClear()
    const res = await findGaps(log, MAX_DEBRIEF_QUESTIONS)
    expect(res.done).toBe(true)
    expect(generateJson).not.toHaveBeenCalled()
  })
})

describe('buildWorkMap', () => {
  it('keeps verified quotes, drops invented ones and unknown target ids', async () => {
    generateJson.mockResolvedValueOnce({
      task: 'Process invoices',
      steps: [
        { title: 'Code the cost center', targetId: 'field-costCenter', startT: 40_000, endT: 56_000, decision: '4711 → 0400', reasonQuote: 'Equipment over five thousand is always capex.', isJudgmentCall: true, confidence: 0.9, guardrailIds: ['G1', 'G9'] },
        { title: 'Call the supplier', targetId: 'phone', startT: 60_000, endT: 61_000, decision: 'Called', reasonQuote: 'I always call them first.', isJudgmentCall: false, confidence: 0.8, guardrailIds: [] },
      ],
      guardrails: [
        { id: 'G1', text: 'Equipment over €5,000 is capex.', quote: 'Equipment over five thousand is always capex.' },
        { id: 'G2', text: 'Never pay on Fridays.', quote: 'We never pay on Fridays.' },
      ],
      openQuestions: [],
    })
    const { workMap, warnings } = await buildWorkMap('s1', log)
    const [s1, s2] = workMap.steps
    expect(s1).toMatchObject({ id: 'S1', targetId: 'field-costCenter', guardrailIds: ['G1'], reason: { t: 55_000 } })
    expect(s2.targetId).toBeUndefined()
    expect(s2.reason).toBeUndefined()
    expect(s2.confidence).toBeCloseTo(0.48)
    // Clips are centered on the real screen event of the step (here "posted" at 60 s).
    expect(s2.moment).toEqual({ t: 60_000, event: 'Invoice 4471: posted' })
    expect(s2.clip).toEqual(clipAround(60_000))
    expect(s1.moment).toEqual({ t: 41_000, event: 'Invoice 4471: cost center 4711 → 0400 (capex)' })
    expect(workMap.guardrails.map((g) => g.id)).toEqual(['G1'])
    expect(workMap.guardrails[0]).toMatchObject({ stepId: 'S1', severity: 'block', when: [], require: [] })
    // The rule was said right after a live question about the capex change: linked to that screen moment.
    expect(workMap.guardrails[0].quote.via).toBe('live_question')
    expect(workMap.guardrails[0].moment).toEqual({ t: 41_000, event: 'Invoice 4471: cost center 4711 → 0400 (capex)' })
    expect(warnings).toHaveLength(2)
  })
})

describe('debrief question state', () => {
  it('lists the live questions and whether the expert answered them', async () => {
    const { liveQuestions } = await import('./debrief')
    const withUnanswered: LogLine[] = [...log, { t: 70_000, who: 'agent', text: 'Is there a limit?' }, { t: 72_000, who: 'screen', text: 'Invoice 4472: put on hold' }]
    expect(liveQuestions(withUnanswered)).toEqual([
      { question: 'What made you do that?', t: 52_000, answered: true },
      { question: 'Is there a limit?', t: 70_000, answered: false },
    ])
    // Debrief questions in the log are not live questions.
    expect(liveQuestions(withUnanswered, [{ question: 'Is there a limit?', answered: false }]).map((q) => q.question)).toEqual(['What made you do that?'])
  })

  it('fallback questions are tied to real screen moments and never repeat', async () => {
    const { fallbackGaps } = await import('./debrief')
    const gaps = fallbackGaps(log, 3, [{ question: 'When do you stop on an invoice like this and ask someone, and who is that?' }], 2)
    expect(gaps).toHaveLength(3)
    expect(gaps.map((g) => g.id)).toEqual(['gap-3', 'gap-4', 'gap-5'])
    expect(gaps.some((g) => g.question.startsWith('When do you stop'))).toBe(false)
    for (const g of gaps) expect([41_000, 30_000, 60_000].map((t) => clipAround(t).start)).toContain(g.clip.start)
  })

  it('keeps asking while fewer than three debrief questions were asked, even if the model fails', async () => {
    generateJson.mockReset()
    generateJson.mockRejectedValue(new Error('model down'))
    const res = await findGaps(log, [{ question: 'Who releases a hold?', answered: true }])
    expect(res.done).toBe(false)
    expect(res.required).toBe(2)
    expect(res.gaps).toHaveLength(2)
  })
})

describe('screen moments', () => {
  it('never invents a moment: a step far from any screen event has none', async () => {
    const { stepMoment, momentBefore } = await import('./debrief')
    expect(stepMoment(log, 400_000, 410_000)).toBeNull()
    expect(stepMoment(log, 61_000, 70_000)).toEqual({ t: 60_000, event: 'Invoice 4471: posted' }) // within the slack
    expect(momentBefore(log, 20_000)).toBeNull() // nothing on screen before it
    expect(momentBefore(log, 58_000)?.t).toBe(41_000) // the decision, not the later "opened"
  })

  it('a rule from the debrief about an unseen case has no screen moment', async () => {
    const debriefLog: LogLine[] = [
      ...log,
      { t: 300_000, who: 'agent', text: 'What if a supplier is not in the vendor master?' },
      { t: 304_000, who: 'expert', text: "If they're not in the vendor master, I don't pay. I hold it and ask Weber." },
    ]
    generateJson.mockResolvedValueOnce({
      task: 'Process invoices',
      steps: [{ title: 'Code the cost center', targetId: 'field-costCenter', startT: 40_000, endT: 56_000, decision: '4711 → 0400', reasonQuote: '', isJudgmentCall: true, confidence: 0.9, guardrailIds: [] }],
      guardrails: [{ id: 'G5', text: 'Unknown supplier: hold and ask the controller.', quote: "If they're not in the vendor master, I don't pay." }],
      openQuestions: [],
    })
    const { workMap } = await buildWorkMap('s1', debriefLog)
    expect(workMap.guardrails[0].quote.via).toBe('debrief')
    expect(workMap.guardrails[0].moment).toBeNull()
  })
})
