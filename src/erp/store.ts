import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { emitEvent } from '../shared/bus'
import { session } from '../shared/session'
import { evaluateGuardrails, type Violation } from './guardrails'
import { accountFor, COST_CENTERS, type Invoice } from './model'
import { ALL_INVOICES } from './seed'

export type EditableField = 'category' | 'costCenter' | 'assetNumber' | 'approver'
export type ErpAction = 'hold' | 'request_approval' | 'post'

// data-target ids, shared with the mascot (P4) and the step tracker.
export const fieldTarget = (field: EditableField) => `field-${field}`
export const actionTarget = (action: ErpAction) => `action-${action}`
export const rowTarget = (invoiceId: string) => `row-${invoiceId}`
export const PREVIEW_TARGET = 'invoice-preview'

interface Blocked {
  invoiceId: string
  violations: Violation[]
}

interface ErpState {
  invoices: Record<string, Invoice>
  openId: string | null
  blocked: Blocked | null
  open: (id: string | null) => void
  update: (id: string, field: EditableField, value: string) => void
  commit: (id: string, action: ErpAction) => { ok: boolean; violations: Violation[] }
  dismissBlocked: () => void
  reset: () => void
}

const initialInvoices = () => Object.fromEntries(ALL_INVOICES.map((i) => [i.id, structuredClone(i)]))

const costCenterLabel = (code: string) => {
  const cc = COST_CENTERS.find((c) => c.code === code)
  return cc ? `${cc.code} ${cc.name} (${cc.account})` : code
}

function applyAction(inv: Invoice, action: ErpAction): Invoice {
  switch (action) {
    case 'hold':
      return { ...inv, status: 'on_hold' }
    case 'request_approval':
      return { ...inv, approvalRequested: true, status: 'awaiting_approval' }
    case 'post':
      return { ...inv, status: 'posted' }
  }
}

export const useErp = create<ErpState>()(
  persist(
    (set, get) => ({
      invoices: initialInvoices(),
      openId: null,
      blocked: null,

      open: (id) => {
        set({ openId: id, blocked: null })
        if (id) emitEvent({ source: 'dom', kind: 'invoice_opened', invoiceId: id, targetId: rowTarget(id) })
      },

      update: (id, field, value) => {
        const inv = get().invoices[id]
        if (!inv || inv[field] === value) return
        const next: Invoice = { ...inv, [field]: value }
        if (field === 'costCenter') next.account = accountFor(value)
        set({ invoices: { ...get().invoices, [id]: next }, blocked: null })
        const label = field === 'costCenter' ? costCenterLabel : (v: string) => v
        emitEvent({
          source: 'dom',
          kind: 'field_changed',
          invoiceId: id,
          targetId: fieldTarget(field),
          from: label(String(inv[field] ?? '')),
          to: label(value),
          meta: { field },
        })
      },

      commit: (id, action) => {
        const inv = get().invoices[id]
        if (!inv) return { ok: false, violations: [] }
        const proposed = applyAction(inv, action)

        // Guardrails are only enforced on the trainee, and only when money moves.
        const { mode, workMap } = session()
        if (mode === 'teach' && action === 'post' && workMap) {
          const violations = evaluateGuardrails(proposed, workMap.guardrails)
          for (const v of violations) {
            emitEvent({
              source: 'system',
              kind: 'guardrail_violation',
              invoiceId: id,
              targetId: v.guardrail.stepId
                ? workMap.steps.find((s) => s.id === v.guardrail.stepId)?.targetId
                : actionTarget(action),
              text: v.guardrail.text,
              meta: {
                guardrailId: v.guardrail.id,
                severity: v.guardrail.severity,
                quote: v.guardrail.quote,
                stepId: v.guardrail.stepId,
                failed: v.failed,
              },
            })
          }
          const blocking = violations.filter((v) => v.guardrail.severity === 'block')
          if (blocking.length > 0) {
            set({ blocked: { invoiceId: id, violations: blocking } })
            return { ok: false, violations }
          }
        }

        set({ invoices: { ...get().invoices, [id]: proposed }, blocked: null })
        emitEvent({ source: 'dom', kind: 'action', action, invoiceId: id, targetId: actionTarget(action) })
        return { ok: true, violations: [] }
      },

      dismissBlocked: () => set({ blocked: null }),

      reset: () => set({ invoices: initialInvoices(), openId: null, blocked: null }),
    }),
    {
      name: 'sabine-erp',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ invoices: s.invoices }),
      skipHydration: true, // SSR: call useErp.persist.rehydrate() in a client useEffect
    },
  ),
)

/** Non-React access for other modules (tutor, step tracker). */
export const erp = useErp.getState
