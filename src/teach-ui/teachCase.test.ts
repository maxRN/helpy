// Test C of the brief: a new hire works a case Sabine never showed (5102, €7,200 laser cutter). The tutor
// catches the wrong decision before anything is posted and explains it with Sabine's own reason.
import { beforeEach, describe, expect, it } from 'vitest'
import { FIXTURE_WORKMAP } from '../erp/fixtures'
import { erp } from '../erp/store'
import { clearEventLog, getEventLog } from '../shared/bus'
import { useSession } from '../shared/session'
import { buildReport, explainIntervention } from './model'

const violations = () => getEventLog().filter((e) => e.kind === 'guardrail_violation')
const G1 = FIXTURE_WORKMAP.guardrails.find((g) => g.id === 'G1')!

beforeEach(() => {
  erp().reset()
  clearEventLog()
  useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP, t0: null })
})

describe('Teach: catching a wrong decision in a fresh case (Test C)', () => {
  it('5102 is a case Sabine never showed', () => {
    expect(erp().invoices['5102']).toMatchObject({ teachOnly: true, category: 'equipment', amount: 7200, account: 'opex' })
  })

  it('catches re-coding the equipment invoice to opex the moment it happens, before any post', () => {
    erp().open('5102')
    erp().update('5102', 'costCenter', '0400') // capex: right; the asset number is simply the next step
    expect(violations()).toHaveLength(0)
    erp().update('5102', 'costCenter', '4711') // back to opex: wrong
    expect(violations()).toHaveLength(1)
    expect(violations()[0]).toMatchObject({ invoiceId: '5102', meta: { guardrailId: 'G1', stage: 'decision', quote: G1.quote } })
    expect(erp().invoices['5102'].status).toBe('open') // nothing was posted
  })

  it('blocks posting it as opex, then lets the corrected invoice through', () => {
    erp().open('5102')
    const tried = erp().commit('5102', 'post')
    expect(tried.ok).toBe(false)
    expect(erp().invoices['5102'].status).toBe('open')
    expect(violations().map((v) => [v.meta?.guardrailId, v.meta?.stage])).toEqual([['G1', 'post']])

    erp().update('5102', 'costCenter', '0400')
    erp().update('5102', 'assetNumber', 'A-2026-131')
    expect(erp().commit('5102', 'post').ok).toBe(true)
    expect(erp().invoices['5102'].status).toBe('posted')
  })

  it('explains the stop with the reason Sabine gave, not a generic "wrong"', () => {
    const text = explainIntervention(FIXTURE_WORKMAP, G1)
    expect(text).toContain(`“${G1.quote.text}”`)
    expect(text).toContain('Sabine said')
    expect(text).toMatch(/capex/)
  })

  it('does not stop a correct decision: small equipment may stay opex (5105)', () => {
    erp().open('5105')
    erp().update('5105', 'costCenter', '4100')
    erp().update('5105', 'costCenter', '4711')
    expect(violations()).toHaveLength(0)
    expect(erp().commit('5105', 'post').ok).toBe(true)
  })

  it('the report shows the caught mistake as something to practice', () => {
    erp().open('5102')
    erp().commit('5102', 'post')
    erp().update('5102', 'costCenter', '0400')
    erp().update('5102', 'assetNumber', 'A-2026-131')
    erp().commit('5102', 'post')
    const report = buildReport(FIXTURE_WORKMAP, Object.values(erp().invoices), getEventLog())
    const step = report.cases.find((c) => c.invoice.id === '5102')!.steps.find((s) => s.step.guardrailIds.includes('G1'))!
    expect(step.outcome).toBe('caught')
    expect(report.practice.map((p) => p.step.id)).toContain(step.step.id)
  })
})
