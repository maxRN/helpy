import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../shared/types'
import { toLogLines } from './sessionLog'

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

  it('leaves out everything that happened off the record (Trust)', () => {
    const events: AppEvent[] = [
      { id: '1', t: 10_000, source: 'vision', kind: 'field_changed', text: 'Invoice 4471: cost center 4711 → 0400' },
      { id: '2', t: 20_000, source: 'voice', kind: 'off_record_start' },
      { id: '3', t: 21_000, source: 'vision', kind: 'action', text: 'Invoice 4480: put on hold' },
      { id: '4', t: 22_000, source: 'voice', kind: 'utterance', speaker: 'expert', text: 'Between us, Weber always approves late.' },
      { id: '5', t: 30_000, source: 'voice', kind: 'off_record_end' },
      { id: '6', t: 31_000, source: 'voice', kind: 'utterance', speaker: 'expert', text: 'Now the Kramer invoice.' },
    ]
    expect(toLogLines(events).map((l) => l.text)).toEqual(['Invoice 4471: cost center 4711 → 0400', 'Now the Kramer invoice.'])
  })
})
