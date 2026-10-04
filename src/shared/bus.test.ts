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

describe('one clock per session', () => {
  it('keeps the recording’s timeline after it ends, so the debrief comes after the task', async () => {
    const { useSession } = await import('./session')
    clearEventLog()
    const start = Date.now() - 180_000 // the task ran for three minutes
    useSession.getState().newSession('s-clock')
    useSession.getState().setT0(start)
    emitEvent({ source: 'dom', kind: 'field_changed', text: 'during the task' })
    useSession.getState().setT0(null) // "I'm done"
    emitEvent({ source: 'voice', kind: 'answer_given', speaker: 'expert', text: 'in the debrief' })
    const [during, after] = getEventLog()
    expect(after.t).toBeGreaterThanOrEqual(during.t)
    expect(after.t).toBeGreaterThanOrEqual(180_000)
    useSession.getState().newSession('s-next')
    expect(useSession.getState().clockT0).toBeNull() // a new session starts its own clock
  })
})
