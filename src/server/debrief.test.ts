import { describe, expect, it, vi } from 'vitest'
import type { LogLine } from './debrief'

const generateJson = vi.fn()
vi.mock('./anthropic', () => ({ generateJson: (...args: unknown[]) => generateJson(...args), MODELS: { deep: 'claude-opus-5-5' } }))

const { buildWorkMap, clipAround, findExpertQuote, findGaps, MAX_DEBRIEF_QUESTIONS, NotEnoughWorkError } = await import('./debrief')

const log: LogLine[] = [
  { t: 30_000, who: 'screen', text: 'Opened invoice 4471 from Midwest Machine Tools Inc. ($6,800.00, equipment)' },
  { t: 41_000, who: 'screen', text: 'Invoice 4471: cost center 4711 → 0400 (capex)' },
  { t: 52_000, who: 'agent', text: 'What made you do that?' },
  { t: 55_000, who: 'expert', text: "Equipment over five thousand is always capex. That's our policy." },
  { t: 60_000, who: 'screen', text: 'Invoice 4471: posted' },
]

const chatter: LogLine[] = [
  { t: 30_000, who: 'screen', text: 'Opened invoice 4458 from Great Lakes Freight ($1,840.00, services)' },
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
        { id: 'G1', text: 'Equipment over $5,000 is capex.', quote: 'Equipment over five thousand is always capex.' },
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
    expect(s2.clip.end - s2.clip.start).toBe(10_000) // clips are at least 10 s
    expect(workMap.guardrails.map((g) => g.id)).toEqual(['G1'])
    expect(workMap.guardrails[0]).toMatchObject({ stepId: 'S1', severity: 'block', when: [], require: [] })
    expect(warnings).toHaveLength(2)
  })
})
