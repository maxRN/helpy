import { describe, expect, it } from 'vitest'
import { ALL_INVOICES } from './seed'
import { describeErpScreen } from './screenSnapshot'
import { PREVIEW_TARGET, rowTarget } from './targetIds'

const invoices = Object.fromEntries(ALL_INVOICES.map((i) => [i.id, structuredClone(i)]))
const nothing = () => false

describe('describeErpScreen', () => {
  it('describes the open invoice with the values the app shows, nothing else', () => {
    const inv = { ...invoices['4471'], costCenter: '0400', account: 'capex' as const }
    const text = describeErpScreen({ invoices: { ...invoices, '4471': inv }, openId: '4471', visible: (id) => id === PREVIEW_TARGET })!
    expect(text).toContain('invoice 4471 open')
    expect(text).toContain(inv.supplierName)
    expect(text).toContain('cost center 0400 Capital Equipment (capex)')
    expect(text).toContain('asset no. empty')
    // Only invoice numbers that exist: the open one.
    expect(text.match(/invoice (\d+)/g)).toEqual(['invoice 4471'])
  })

  it('lists the visible open invoices in the inbox', () => {
    const shown = new Set(['4471', '4472'].map(rowTarget))
    const text = describeErpScreen({ invoices, openId: null, visible: (id) => shown.has(id) })!
    expect(text).toMatch(/^ProcureFlow inbox, no invoice open\. 2 open invoices: 4471 /)
    expect(text).toContain('4472 ')
  })

  it('is null when ProcureFlow is not on screen (closed or minimized)', () => {
    expect(describeErpScreen({ invoices, openId: '4471', visible: nothing })).toBeNull()
  })

  it('mentions the guardrail that stopped a posting', () => {
    const text = describeErpScreen({ invoices, openId: '4472', visible: (id) => id === PREVIEW_TARGET, blockedBy: ['Hold Kramer at quarter-end.'] })
    expect(text).toContain('posting stopped by a guardrail: Hold Kramer at quarter-end.')
  })
})
