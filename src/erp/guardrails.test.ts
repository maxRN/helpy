import { describe, expect, it } from 'vitest'
import { evaluateGuardrails } from './guardrails'
import { FIXTURE_GUARDRAILS } from './fixtures'
import { accountFor, type Invoice } from './model'
import { DEMO_INVOICES, TEACH_INVOICE, TEACH_INVOICES } from './seed'

const byId = (id: string) => [...DEMO_INVOICES, ...TEACH_INVOICES].find((i) => i.id === id)!
const ids = (inv: Invoice) => evaluateGuardrails(inv, FIXTURE_GUARDRAILS).map((v) => v.guardrail.id)
const recode = (inv: Invoice, costCenter: string): Invoice => ({ ...inv, costCenter, account: accountFor(costCenter) })

describe('evaluateGuardrails on the demo invoices', () => {
  it('4471: posting as opex breaks the capex rule', () => {
    expect(ids({ ...byId('4471'), status: 'posted' })).toEqual(['G1'])
  })

  it('4471: capex without asset number is still blocked', () => {
    expect(ids(recode({ ...byId('4471'), status: 'posted' }, '0400'))).toEqual(['G2'])
  })

  it('4471: capex with asset number passes', () => {
    expect(ids({ ...recode(byId('4471'), '0400'), assetNumber: 'A-2026-117', status: 'posted' })).toEqual([])
  })

  it('4472: posting Kramer at the September quarter-end is blocked, holding it is fine', () => {
    expect(ids({ ...byId('4472'), status: 'posted' })).toEqual(['G3'])
    expect(ids({ ...byId('4472'), status: 'on_hold' })).toEqual([])
  })

  it('4473: Brno intercompany needs a second approval', () => {
    expect(ids({ ...byId('4473'), status: 'posted' })).toEqual(['G4'])
    expect(ids({ ...byId('4473'), approvalRequested: true, status: 'awaiting_approval' })).toEqual([])
  })

  it('4474: office supplies trigger nothing', () => {
    expect(ids({ ...byId('4474'), status: 'posted' })).toEqual([])
  })

  it('5102 (teach case): €7,200 equipment as opex is caught', () => {
    expect(ids({ ...TEACH_INVOICE, status: 'posted' })).toEqual(['G1'])
  })

  it('extra teach cases: Kramer held, Brno approved, small equipment passes', () => {
    expect(ids({ ...byId('5103'), status: 'posted' })).toEqual(['G3'])
    expect(ids({ ...byId('5104'), status: 'posted' })).toEqual(['G4'])
    expect(ids({ ...byId('5105'), status: 'posted' })).toEqual([])
  })

  it('5106: unknown supplier may be held but not posted', () => {
    expect(ids({ ...byId('5106'), status: 'posted' })).toEqual(['G5'])
    expect(ids({ ...byId('5106'), status: 'on_hold' })).toEqual([])
    expect(ids({ ...byId('5106'), approvalRequested: true, status: 'awaiting_approval' })).toEqual([])
  })

  it('Kramer outside a quarter-end is not held (its August invoice was posted normally)', () => {
    expect(ids({ ...byId('4472'), month: 8, status: 'posted' })).toEqual([])
    expect(ids({ ...byId('4472'), month: 11, status: 'posted' })).toEqual([])
    expect(ids({ ...byId('4472'), month: 12, status: 'posted' })).toEqual(['G3'])
  })

  it('a compiled rule matches whether the model wrote month numbers as numbers or strings', () => {
    const g3 = FIXTURE_GUARDRAILS.find((g) => g.id === 'G3')!
    const asStrings = { ...g3, when: [g3.when[0]!, { field: 'month' as const, op: 'in' as const, value: ['3', '6', '9', '12'] }] }
    expect(evaluateGuardrails({ ...byId('4472'), status: 'posted' }, [asStrings]).map((v) => v.guardrail.id)).toEqual(['G3'])
  })
})
