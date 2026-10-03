import { beforeEach, describe, expect, it } from 'vitest'
import { bus, clearEventLog, getEventLog } from '../shared/bus'
import { useSession } from '../shared/session'
import { FIXTURE_WORKMAP } from './fixtures'
import { getNextStep, installStepTracker, markTouched, resetStepTracker } from './stepTracker'
import { erp } from './store'

const kinds = () => getEventLog().map((e) => e.kind)
const deviations = () => getEventLog().filter((e) => e.kind === 'sequence_deviation')

beforeEach(() => {
  installStepTracker() // idempotent, like in the app
  erp().reset()
  clearEventLog()
  resetStepTracker()
  useSession.setState({ mode: 'capture', workMap: null, t0: null })
})

describe('ERP store', () => {
  it('emits field_changed with readable from/to and derives the GL account', () => {
    erp().open('4471')
    erp().update('4471', 'costCenter', '0400')
    const e = getEventLog().at(-1)!
    expect(e.kind).toBe('field_changed')
    expect(e.targetId).toBe('field-costCenter')
    expect(e.from).toContain('4711')
    expect(e.to).toContain('0400')
    expect(erp().invoices['4471'].account).toBe('capex')
  })

  it('keeps the hold reason on the invoice and in the event text', () => {
    erp().commit('4472', 'hold', '  Kramer double-bills in December  ')
    expect(erp().invoices['4472'].note).toBe('Kramer double-bills in December')
    const e = getEventLog().at(-1)!
    expect(e).toMatchObject({ kind: 'action', action: 'hold', text: 'Kramer double-bills in December' })
  })

  it('does not enforce guardrails on the expert in Capture mode', () => {
    useSession.setState({ workMap: FIXTURE_WORKMAP })
    expect(erp().commit('4471', 'post').ok).toBe(true)
    expect(erp().invoices['4471'].status).toBe('posted')
  })

  it('blocks the trainee on 5102 as opex, then lets the fix through', () => {
    useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP })
    const first = erp().commit('5102', 'post')
    expect(first.ok).toBe(false)
    expect(erp().invoices['5102'].status).toBe('open')
    expect(erp().blocked?.violations[0].guardrail.id).toBe('G1')
    const violation = getEventLog().find((e) => e.kind === 'guardrail_violation')!
    expect(violation.meta?.guardrailId).toBe('G1')
    expect(violation.targetId).toBe('field-costCenter')

    erp().update('5102', 'costCenter', '0400')
    expect(erp().commit('5102', 'post').violations.map((v) => v.guardrail.id)).toEqual(['G2'])

    erp().update('5102', 'assetNumber', 'A-2025-131')
    expect(erp().commit('5102', 'post').ok).toBe(true)
    expect(kinds().at(-1)).toBe('action')
  })
})

describe('step tracker', () => {
  it('counts opening the invoice as looking at it', () => {
    useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP })
    expect(getNextStep('5102')?.id).toBe('S1')
    erp().open('5102')
    expect(getNextStep('5102')?.id).toBe('S2')
    expect(deviations()).toHaveLength(0)
  })

  it('flags a skipped step once, without blocking', () => {
    useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP })
    erp().open('5102')
    erp().update('5102', 'costCenter', '4100') // S3 before S2 (category)
    erp().update('5102', 'costCenter', '4711')
    expect(deviations()).toHaveLength(1)
    expect(deviations()[0].meta?.expectedStepId).toBe('S2')
    expect(erp().invoices['5102'].costCenter).toBe('4711')
  })

  it('skips judgment-call steps whose guardrails do not apply', () => {
    useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP })
    // 4474 is office supplies: no capex, no Kramer hold, no Brno approval.
    const ids: string[] = []
    let step = getNextStep('4474')
    while (step && ids.length < 10) {
      ids.push(step.id)
      bus.emit('event', { id: step.id, t: 0, source: 'dom', kind: 'action', invoiceId: '4474', targetId: step.targetId })
      step = getNextStep('4474')
    }
    expect(ids).toEqual(['S1', 'S2', 'S7'])
  })

  it('asks for the asset number only once the invoice is coded as capex', () => {
    useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP })
    erp().open('5102')
    markTouched('5102', 'field-category') // category was already right; the trainee only focused it
    expect(getNextStep('5102')?.id).toBe('S3')
    erp().update('5102', 'costCenter', '0400')
    expect(getNextStep('5102')?.id).toBe('S4')
  })
})
