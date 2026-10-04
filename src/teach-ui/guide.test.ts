// Teach: Helpy leads through the Work Map, never skips a step, and says (and shows) one line per step.
import { describe, expect, it, vi } from 'vitest'
import { FIXTURE_WORKMAP } from '../erp/fixtures'
import { TEACH_INVOICE, DEMO_INVOICES } from '../erp/seed'
import type { Step } from '../shared/types'
import { createGuide, cueFor, type Cue, type GuideState } from './guide'

const step = (id: string) => FIXTURE_WORKMAP.steps.find((s) => s.id === id) as Step

const base = (over: Partial<GuideState> = {}): GuideState => ({
  wm: FIXTURE_WORKMAP,
  appOpen: true,
  ready: true,
  nextCase: TEACH_INVOICE,
  open: null,
  finished: false,
  nextStep: step('S1'),
  ...over,
})

describe('cueFor: what Helpy says now', () => {
  it('starts by opening ProcureFlow, pointing at its desktop icon', () => {
    expect(cueFor(base({ appOpen: false, ready: false }))).toEqual({
      key: 'open-app',
      text: 'First, we open ProcureFlow. Click its icon on your desktop.',
      target: 'desktop-procureflow',
    })
  })

  it('speaks right away while the case is still prepared, then names the case to open', () => {
    expect(cueFor(base({ ready: false }))?.key).toBe('intro')
    const open = cueFor(base())!
    expect(open.key).toBe(`open:${TEACH_INVOICE.id}`)
    expect(open.target).toBe(`row-${TEACH_INVOICE.id}`)
    // The Work Map's first step (look at the invoice) is done by opening it, so it is said here, not skipped.
    expect(open.text).toContain(`open invoice ${TEACH_INVOICE.number}`)
    expect(open.text).toContain("Sabine's first step: open the invoice and check it against the PO.")
  })

  it('says the next step and points at it; judgment calls are asked, not told', () => {
    const open = { ...TEACH_INVOICE }
    expect(cueFor(base({ open, nextStep: step('S2') }))).toEqual({ key: `step:${open.id}:S2`, text: 'Next: check the category.', target: 'field-category' })
    expect(cueFor(base({ open, nextStep: step('S3') }))?.text).toBe('Code the invoice to a cost center. Your call: what would Sabine do here?')
  })

  it('asks for the decision once every step is done, and stays quiet once the case is finished', () => {
    const open = { ...TEACH_INVOICE }
    expect(cueFor(base({ open, nextStep: null }))).toMatchObject({ key: `decide:${open.id}`, target: 'action-post' })
    expect(cueFor(base({ open, nextStep: null, finished: true }))).toBeNull()
  })

  it("sends the trainee back when they open one of Sabine's own invoices", () => {
    expect(cueFor(base({ open: DEMO_INVOICES[0] }))?.text).toContain(`open invoice ${TEACH_INVOICE.number}`)
  })
})

describe('createGuide: one line per step, in order, only after the step was done', () => {
  it('does not move on (or repeat itself) until the expected action happened', () => {
    const said: Cue[] = []
    let state = base({ appOpen: false, ready: false })
    const guide = createGuide({ state: () => state, say: (c) => void said.push(c) })

    guide.update()
    guide.update() // nothing happened: nothing new to say
    expect(said.map((c) => c.key)).toEqual(['open-app'])

    state = base({ ready: false }) // ProcureFlow is open
    guide.update()
    state = base() // the case is ready
    guide.update()
    const open = { ...TEACH_INVOICE }
    state = base({ open, nextStep: step('S2') }) // invoice opened (S1 done by opening it)
    guide.update()
    guide.update() // the trainee clicked around but did not do S2: still S2, said once
    state = base({ open, nextStep: step('S3') }) // S2 done
    guide.update()
    state = base({ open, nextStep: null }) // every step done
    guide.update()

    expect(said.map((c) => c.key)).toEqual(['open-app', 'intro', `open:${open.id}`, `step:${open.id}:S2`, `step:${open.id}:S3`, `decide:${open.id}`])
  })

  it('gives bubble, pointing and voice one cue: the same words for the same target', () => {
    const say = vi.fn()
    const guide = createGuide({ state: () => base({ open: { ...TEACH_INVOICE }, nextStep: step('S4') }), say })
    guide.update()
    expect(say).toHaveBeenCalledTimes(1)
    expect(say.mock.calls[0][0]).toEqual({ key: `step:${TEACH_INVOICE.id}:S4`, text: 'Next: enter the asset number.', target: 'field-assetNumber' })
  })

  it('says the current step again after an aside when asked to', () => {
    const say = vi.fn()
    const guide = createGuide({ state: () => base({ open: { ...TEACH_INVOICE }, nextStep: step('S3') }), say })
    guide.update()
    guide.say({ key: 'aside', text: 'That’s it. Sabine would do the same.', target: null }, { repeatStepAfter: true })
    guide.update()
    expect(say.mock.calls.map((c) => c[0].key)).toEqual([`step:${TEACH_INVOICE.id}:S3`, 'aside', `step:${TEACH_INVOICE.id}:S3`])
  })
})
