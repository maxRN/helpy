// Hand-off from the Work Map (P3) to Teach mode (P2/P4): compile guardrails, check them, switch modes.
import { session } from '../shared/session'
import type { Guardrail, WorkMap } from '../shared/types'
import { evaluateGuardrails } from './guardrails'
import { ALL_INVOICES } from './seed'
import { resetStepTracker } from './stepTracker'
import { erp } from './store'

const SEED_STATUS = new Map(ALL_INVOICES.map((i) => [i.id, i.status]))

export interface TeachStart {
  workMap: WorkMap
  warnings: string[]
}

async function compile(guardrails: Guardrail[]): Promise<{ guardrails: Guardrail[]; warnings: string[] }> {
  const res = await fetch('/api/guardrails/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guardrails: guardrails.map(({ id, text, quote, stepId, severity }) => ({ id, text, quote, stepId, severity })),
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Compile failed with HTTP ${res.status}`)
  return body
}

/**
 * Sabine's own finished invoices are the ground truth: a blocking rule that her work breaks
 * was compiled wrong, so it is downgraded to "ask" instead of stopping the trainee unfairly.
 */
export function checkAgainstExpert(guardrails: Guardrail[]): { guardrails: Guardrail[]; warnings: string[] } {
  // Only invoices Sabine changed in this session, not the seed's background invoices.
  const done = Object.values(erp().invoices).filter((i) => !i.teachOnly && i.status !== SEED_STATUS.get(i.id))
  const warnings: string[] = []
  const checked = guardrails.map((g) => {
    if (g.severity !== 'block') return g
    const broken = done.filter((inv) => evaluateGuardrails(inv, [g]).length > 0)
    if (broken.length === 0) return g
    warnings.push(`${g.id}: Sabine's own invoice ${broken.map((b) => b.id).join(', ')} breaks this rule, so it only asks.`)
    return { ...g, severity: 'ask' as const }
  })
  return { guardrails: checked, warnings }
}

/**
 * Compiles the Work Map's guardrails from Sabine's words, sanity-checks them against her own work,
 * stores the Work Map and switches to Teach mode. If compiling fails, the Work Map's existing
 * conditions are kept and a warning says so.
 */
export async function startTeach(workMap: WorkMap): Promise<TeachStart> {
  let guardrails = workMap.guardrails
  const warnings: string[] = []
  try {
    const compiled = await compile(workMap.guardrails)
    guardrails = compiled.guardrails
    warnings.push(...compiled.warnings)
  } catch (err) {
    warnings.push(`Guardrails were not recompiled (${err instanceof Error ? err.message : String(err)}); using the Work Map as is.`)
  }

  const checked = checkAgainstExpert(guardrails)
  warnings.push(...checked.warnings)

  const ready: WorkMap = { ...workMap, guardrails: checked.guardrails }
  session().setWorkMap(ready)
  session().setMode('teach')
  erp().open(null)
  resetStepTracker()
  if (warnings.length > 0) console.warn('[startTeach]', warnings)
  return { workMap: ready, warnings }
}
