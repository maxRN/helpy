import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { erp } from '../erp/store'
import { mascot } from '../mascot'
import { emitEvent } from '../shared/bus'
import { mascot as shared, useMascot } from '../shared/mascot'
import { installBubbleLifecycle } from './bubbleLifecycle'
import { usePanel } from './panel/store'

const bubble = () => useMascot.getState().bubble
let uninstall: () => void

beforeEach(() => {
  vi.useFakeTimers()
  mascot.reset()
  usePanel.setState({ open: false })
  erp().open(null)
  uninstall = installBubbleLifecycle()
})
afterEach(() => {
  uninstall()
  vi.useRealTimers()
})

describe('speech bubble lifecycle', () => {
  it('never disappears because time passed', () => {
    mascot.bubble('Hi Sabine! Click me whenever you need me.')
    shared.bubble('You moved that one to capex. What made you do that?') // the agent's question
    vi.advanceTimersByTime(10 * 60_000)
    expect(bubble()).toBe('You moved that one to capex. What made you do that?')
    mascot.bubble('Next: check the cost center.', { topic: 'step' })
    vi.advanceTimersByTime(10 * 60_000)
    expect(bubble()).toBe('Next: check the cost center.')
  })

  it('is replaced by a new question', () => {
    mascot.bubble('Okay, another time.')
    shared.bubble('Why did you hold the Kramer invoice?')
    expect(bubble()).toBe('Why did you hold the Kramer invoice?')
  })

  it('a notice ends when the user works on, and stops pointing at what it explained', () => {
    mascot.pointTo('field-costCenter')
    mascot.bubble('This is where Sabine changes the cost center.')
    emitEvent({ source: 'dom', kind: 'field_changed', invoiceId: '4471', targetId: 'field-costCenter', from: '4711', to: '0400' })
    expect(bubble()).toBeNull()
    expect(useMascot.getState().pointTarget).toBeNull()
  })

  it('a notice ends when the user speaks to Helpy', () => {
    mascot.bubble('I understood that equipment over 5,000 is capex.')
    emitEvent({ source: 'voice', kind: 'utterance', speaker: 'expert', text: 'Genau.' })
    expect(bubble()).toBeNull()
  })

  it('a question stays while the user works, until it is answered', () => {
    shared.bubble('Why did you hold the Kramer invoice?')
    emitEvent({ source: 'dom', kind: 'invoice_opened', invoiceId: '4473' })
    expect(bubble()).toBe('Why did you hold the Kramer invoice?')
    shared.bubble(null) // the answer arrived (agent/transcript clears it)
    expect(bubble()).toBeNull()
  })

  it('buttons stay until used, even while the user works; opening Helpy ends them', () => {
    mascot.bubble('I’m watching and listening.', { actions: [{ label: 'I’m done', onClick: () => undefined }] })
    emitEvent({ source: 'dom', kind: 'field_changed', invoiceId: '4471' })
    expect(bubble()).toBe('I’m watching and listening.')
    usePanel.setState({ open: true })
    expect(bubble()).toBeNull()
  })

  it('Teach guidance ends when the related task is done (next step) or the invoice is closed', () => {
    erp().open('5102')
    mascot.bubble('Next: check the cost center.', { topic: 'step' })
    emitEvent({ source: 'dom', kind: 'field_changed', invoiceId: '5102' })
    expect(bubble()).toBe('Next: check the cost center.') // Teach replaces it with the next step itself
    mascot.bubble('Next: enter the asset number.', { topic: 'step' })
    expect(bubble()).toBe('Next: enter the asset number.')
    erp().open(null)
    expect(bubble()).toBeNull()
  })

  it('"I have a question for you" ends when the held question is asked', () => {
    shared.waiting('Why capex?')
    mascot.bubble('I have a question for you. No rush, I’ll ask when you pause.', { topic: 'waiting', actions: [{ label: 'Ask me now', onClick: () => undefined }] })
    shared.waiting(null)
    expect(bubble()).toBeNull()
  })
})
