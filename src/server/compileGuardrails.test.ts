import { describe, expect, it } from 'vitest'
import { FIXTURE_GUARDRAILS } from '../erp/fixtures'
import { catalogForPrompt } from '../erp/catalog'
import { mergeCompiled, type CompiledResponse } from './compileGuardrails'

const inputs = FIXTURE_GUARDRAILS.map(({ id, text, quote, stepId }) => ({ id, text, quote, stepId }))
const [g1, , g3] = FIXTURE_GUARDRAILS

describe('mergeCompiled', () => {
  it('keeps valid conditions, the original text and quote, and blocks by default', () => {
    const compiled: CompiledResponse = {
      guardrails: [{ id: 'G1', when: g1.when as never, require: g1.require as never, checkable: true, note: '' }],
    }
    const { guardrails, warnings } = mergeCompiled([inputs[0]], compiled)
    expect(warnings).toEqual([])
    expect(guardrails[0]).toMatchObject({ id: 'G1', text: g1.text, quote: g1.quote, severity: 'block', stepId: 'S3' })
    expect(guardrails[0].require).toEqual(g1.require)
  })

  it('downgrades a rule with an unknown supplier id to ask', () => {
    const compiled: CompiledResponse = {
      guardrails: [
        {
          id: 'G3',
          when: [{ field: 'supplierId', op: 'eq', value: 'Kramer' }],
          require: g3.require as never,
          checkable: true,
          note: '',
        },
      ],
    }
    const { guardrails, warnings } = mergeCompiled([inputs[2]], compiled)
    expect(guardrails[0].severity).toBe('ask')
    expect(guardrails[0].when).toEqual([])
    expect(warnings[0]).toContain('supplierId')
  })

  it('downgrades uncheckable or missing rules to ask', () => {
    const compiled: CompiledResponse = {
      guardrails: [{ id: 'G2', when: [], require: [], checkable: false, note: 'needs the asset register' }],
    }
    const { guardrails, warnings } = mergeCompiled([inputs[1], inputs[3]], compiled)
    expect(guardrails.map((g) => g.severity)).toEqual(['ask', 'ask'])
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('asset register')
  })
})

describe('catalogForPrompt', () => {
  it('lists targets, fields, suppliers and cost centers', () => {
    const text = catalogForPrompt()
    for (const s of ['field-costCenter', 'action-post', 'supplierId', 'SUP-1007: Kramer Industrial Supply', '0400: Capital Equipment (capex)']) {
      expect(text).toContain(s)
    }
  })
})
