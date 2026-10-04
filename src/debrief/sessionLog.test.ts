import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../shared/types'
import { needsGuardrailQuestion, toLogLines } from './sessionLog'

describe('toLogLines', () => {
  it('keeps screen events, speech and questions, in time order, without duplicate answers', () => {
    const events: AppEvent[] = [
      { id: '3', t: 55_000, source: 'voice', kind: 'utterance', speaker: 'expert', text: 'Equipment over five thousand is always capex.' },
      { id: '4', t: 55_400, source: 'voice', kind: 'answer_given', speaker: 'expert', text: 'Equipment over five thousand is always capex.' },
      { id: '1', t: 41_000, source: 'vision', kind: 'field_changed', invoiceId: '9', text: 'Excel: cell B4 → 120' },
      { id: '2', t: 52_000, source: 'voice', kind: 'question_asked', speaker: 'agent', text: 'What made you do that?' },
      { id: '5', t: 60_000, source: 'vision', kind: 'action', text: 'posted', meta: { confirms: 'd1' } },
      { id: '6', t: 61_000, source: 'system', kind: 'screenshot_saved' },
    ]
    expect(toLogLines(events)).toEqual([
      { t: 41_000, who: 'screen', text: 'Excel: cell B4 → 120' },
      { t: 52_000, who: 'agent', text: 'What made you do that?' },
      { t: 55_000, who: 'expert', text: 'Equipment over five thousand is always capex.' },
    ])
  })
})

describe('needsGuardrailQuestion', () => {
  const q = (kind: string, phase = 'capture'): AppEvent => ({ id: kind + phase, t: 1, source: 'voice', kind: 'question_asked', text: '?', meta: { kind, phase } })

  it('is true until a live guardrail question was asked', () => {
    expect(needsGuardrailQuestion([])).toBe(true)
    expect(needsGuardrailQuestion([q('why')])).toBe(true)
    expect(needsGuardrailQuestion([q('why'), q('guardrail')])).toBe(false)
  })

  it('does not count debrief questions', () => {
    expect(needsGuardrailQuestion([q('guardrail', 'debrief')])).toBe(true)
  })
})
