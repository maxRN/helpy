// Server only. Turns Sabine's guardrails (her words) into checkable conditions on invoice fields.
import { z } from 'zod'
import { catalogForPrompt, FIELD_VOCABULARY } from '../erp/catalog'
import { INVOICE_FIELDS, type Condition, type Guardrail } from '../shared/types'
import { generateJson, MODELS } from './anthropic'

const ConditionSchema = z.object({
  field: z.enum(INVOICE_FIELDS as [Condition['field'], ...Condition['field'][]]),
  op: z.enum(['eq', 'neq', 'gt', 'lt', 'in', 'empty', 'not_empty']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()])), z.null()]),
})

const CompiledSchema = z.object({
  guardrails: z.array(
    z.object({
      id: z.string(),
      when: z.array(ConditionSchema),
      require: z.array(ConditionSchema),
      checkable: z.boolean(),
      note: z.string(),
    }),
  ),
})

export type CompiledResponse = z.infer<typeof CompiledSchema>

/** What callers send: the guardrails as the Work Map has them. Conditions may be empty. */
export type GuardrailInput = Pick<Guardrail, 'id' | 'text' | 'quote' | 'stepId'> & Partial<Pick<Guardrail, 'severity'>>

export interface CompileResult {
  guardrails: Guardrail[]
  warnings: string[]
}

const SYSTEM = `You turn an accounts-payable expert's rules into machine-checkable conditions for an invoice-posting check.

How a rule is evaluated when someone tries to post an invoice:
- "when": conditions that ALL must hold for the rule to apply to this invoice.
- "require": conditions that must ALL hold on the invoice as it would be after posting; if any fails, posting is stopped.
- The invoice "status" is evaluated as it would be after the action, so "must be held" means require status eq on_hold.

Rules:
- Use only the listed fields, operators (eq, neq, gt, lt, in, empty, not_empty) and allowed values. Map supplier names to supplier ids.
- Use value null for empty and not_empty. Use numbers for amount and month, booleans for approvalRequested.
- A rule about some months uses op "in" with the month numbers, e.g. "at every quarter-end" is month in [3, 6, 9, 12].
- Keep the expert's meaning. Do not add conditions she did not state or clearly imply.
- If a rule cannot be expressed with these fields (for example it depends on something the ERP does not record), set checkable to false, leave when and require empty, and say why in note.
- Return one entry per input rule, with the same id.`

const valueAllowed = (c: Condition) => {
  const allowed = FIELD_VOCABULARY[c.field].values
  if (!allowed || c.op === 'empty' || c.op === 'not_empty' || c.op === 'gt' || c.op === 'lt') return true
  const values = Array.isArray(c.value) ? c.value : [c.value]
  return values.every((v) => allowed.map(String).includes(String(v)))
}

/**
 * Merges the model's conditions into the guardrails and keeps only what we can trust:
 * a rule with unknown values or nothing to check becomes severity "ask" (the tutor asks, never blocks).
 */
export function mergeCompiled(inputs: GuardrailInput[], compiled: CompiledResponse): CompileResult {
  const warnings: string[] = []
  const byId = new Map(compiled.guardrails.map((g) => [g.id, g]))

  const guardrails = inputs.map((input): Guardrail => {
    const c = byId.get(input.id)
    const base = { id: input.id, text: input.text, quote: input.quote, stepId: input.stepId }
    if (!c) {
      warnings.push(`${input.id}: the model returned nothing for this rule; the tutor will only ask about it.`)
      return { ...base, when: [], require: [], severity: 'ask' }
    }
    const when = c.when as Condition[]
    const require = c.require as Condition[]
    const bad = [...when, ...require].filter((cond) => !valueAllowed(cond))
    if (!c.checkable || require.length === 0 || bad.length > 0) {
      const why = bad.length > 0 ? `unknown value for ${bad.map((b) => b.field).join(', ')}` : c.note || 'not checkable'
      warnings.push(`${input.id}: ${why}; the tutor will only ask about it.`)
      return { ...base, when: bad.length > 0 ? [] : when, require: bad.length > 0 ? [] : require, severity: 'ask' }
    }
    return { ...base, when, require, severity: input.severity ?? 'block' }
  })

  return { guardrails, warnings }
}

export async function compileGuardrails(inputs: GuardrailInput[]): Promise<CompileResult> {
  if (inputs.length === 0) return { guardrails: [], warnings: [] }
  const rules = inputs
    .map((g) => `- id ${g.id}: ${g.text}\n  The expert's own words: "${g.quote.text}"`)
    .join('\n')
  const compiled = await generateJson({
    model: MODELS.deep,
    schema: CompiledSchema,
    system: `${SYSTEM}\n\n${catalogForPrompt()}`,
    content: `Compile these rules:\n${rules}`,
    effort: 'medium',
  })
  return mergeCompiled(inputs, compiled)
}
