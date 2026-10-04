import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { session, useSession } from '../shared/session'
import type { Guardrail } from '../shared/types'
import { FIXTURE_WORKMAP } from './fixtures'
import { erp } from './store'
import { checkAgainstExpert, startTeach } from './teach'

const sabineDidHerJob = () => {
  erp().update('4471', 'costCenter', '0400')
  erp().update('4471', 'assetNumber', 'A-2026-117')
  erp().commit('4471', 'post')
  erp().commit('4472', 'hold')
  erp().commit('4473', 'request_approval')
  erp().commit('4474', 'post')
}

beforeEach(() => {
  erp().reset()
  useSession.setState({ mode: 'capture', workMap: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkAgainstExpert', () => {
  it('keeps every fixture rule when Sabine followed them', () => {
    sabineDidHerJob()
    const { guardrails, warnings } = checkAgainstExpert(FIXTURE_WORKMAP.guardrails)
    expect(warnings).toEqual([])
    expect(guardrails.every((g) => g.severity === 'block')).toBe(true)
  })

  it('downgrades a wrongly compiled rule that Sabine herself breaks', () => {
    sabineDidHerJob()
    // A miscompiled "every invoice needs a second approval": Sabine posted 4471 without one.
    const wrong: Guardrail = { ...FIXTURE_WORKMAP.guardrails[3], id: 'GX', when: [], require: [{ field: 'approvalRequested', op: 'eq', value: true }] }
    const { guardrails, warnings } = checkAgainstExpert([wrong])
    expect(guardrails[0].severity).toBe('ask')
    expect(warnings[0]).toContain('4471')
  })

  it('ignores the seed background invoices', () => {
    // Nothing done yet: no rule may be downgraded because of posted filler invoices.
    expect(checkAgainstExpert(FIXTURE_WORKMAP.guardrails).warnings).toEqual([])
  })
})

describe('startTeach', () => {
  it('uses compiled guardrails and switches to Teach mode', async () => {
    sabineDidHerJob()
    const compiled = FIXTURE_WORKMAP.guardrails.map((g) => ({ ...g }))
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ guardrails: compiled, warnings: [] })))
    const { warnings } = await startTeach({ ...FIXTURE_WORKMAP, guardrails: FIXTURE_WORKMAP.guardrails.map((g) => ({ ...g, when: [], require: [] })) })
    expect(warnings).toEqual([])
    expect(session().mode).toBe('teach')
    expect(session().workMap?.guardrails[0].require).toEqual(FIXTURE_WORKMAP.guardrails[0].require)
  })

  it('falls back to the Work Map as is when the compile route fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'no key' }, { status: 502 })))
    const { warnings, workMap } = await startTeach(FIXTURE_WORKMAP)
    expect(warnings[0]).toContain('no key')
    expect(workMap.guardrails).toHaveLength(FIXTURE_WORKMAP.guardrails.length)
    expect(session().mode).toBe('teach')
  })
})
