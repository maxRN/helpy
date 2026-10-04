import { describe, expect, it } from 'vitest'
import { clearEventLog, emitEvent, getEventLog } from './bus'

describe('event bus privacy', () => {
  it('stores what people say with personal data replaced, and leaves screen events alone', () => {
    clearEventLog()
    emitEvent({ source: 'voice', kind: 'utterance', speaker: 'expert', text: 'Send it to lena.hoffmann@hartmann.de, IBAN DE89 3704 0044 0532 0130 00.' })
    emitEvent({ source: 'vision', kind: 'field_changed', text: 'Invoice 4471: cost center 4711 → 0400' })
    expect(getEventLog().map((e) => e.text)).toEqual(['Send it to [email], IBAN [IBAN].', 'Invoice 4471: cost center 4711 → 0400'])
  })
})
