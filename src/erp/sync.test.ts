import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../shared/session'
import { FIXTURE_WORKMAP } from './fixtures'
import { erp } from './store'
import { setErpSync, type ErpSync } from './sync'

let sync: { [K in keyof ErpSync]: ReturnType<typeof vi.fn> }

beforeEach(() => {
  setErpSync(null)
  erp().reset()
  useSession.setState({ mode: 'capture', workMap: null })
  sync = { patchInvoice: vi.fn(), resetInvoices: vi.fn(), saveWorkMap: vi.fn() }
  setErpSync(sync as unknown as ErpSync)
})

afterEach(() => setErpSync(null))

describe('ERP → database sync', () => {
  it('sends only the changed fields, including the derived GL account', () => {
    erp().update('4471', 'costCenter', '0400')
    expect(sync.patchInvoice).toHaveBeenCalledWith('4471', { costCenter: '0400', account: 'capex' })
  })

  it('sends status and note for a hold', () => {
    erp().commit('4472', 'hold', 'Quarter-end double billing')
    expect(sync.patchInvoice).toHaveBeenCalledWith('4472', { status: 'on_hold', note: 'Quarter-end double billing' })
  })

  it('writes nothing when a guardrail blocks the post', () => {
    useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP })
    erp().commit('5102', 'post')
    expect(sync.patchInvoice).not.toHaveBeenCalled()
  })

  it('resets the shared ledger', () => {
    erp().reset()
    expect(sync.resetInvoices).toHaveBeenCalledOnce()
  })

  it('applies invoices from another device without writing them back', () => {
    const remote = { ...erp().invoices['4471'], status: 'posted' as const }
    erp().replaceFromServer([remote])
    expect(erp().invoices['4471'].status).toBe('posted')
    expect(sync.patchInvoice).not.toHaveBeenCalled()
  })
})
