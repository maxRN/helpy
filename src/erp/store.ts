import { create } from 'zustand'
import { emitEvent } from '../shared/bus'
import { session } from '../shared/session'
import { evaluateGuardrails, type Violation } from './guardrails'
import { accountFor, COST_CENTERS, type Invoice } from './model'
import { ALL_INVOICES } from './seed'
import { diffInvoice, erpSync } from './sync'
import { actionTarget, fieldTarget, rowTarget, type EditableField, type ErpAction } from './targetIds'

export * from './targetIds'

interface Blocked {
  invoiceId: string
  violations: Violation[]
}

interface ErpState {
  // Shared across devices through Convex (see ConvexSync). openId and blocked stay per device.
  invoices: Record<string, Invoice>
  openId: string | null
  blocked: Blocked | null
  open: (id: string | null) => void
  update: (id: string, field: EditableField, value: string) => void
  /** `note`: the reason typed for a hold or approval request (shown on screen, sent as the event text). */
  commit: (id: string, action: ErpAction, note?: string) => { ok: boolean; violations: Violation[] }
  dismissBlocked: () => void
  reset: () => void
  /** Applies the database's invoices (from another device or after load). Does not write back. */
  replaceFromServer: (invoices: Invoice[]) => void
}

const initialInvoices = () => Object.fromEntries(ALL_INVOICES.map((i) => [i.id, structuredClone(i)]))

const costCenterLabel = (code: string) => {
  const cc = COST_CENTERS.find((c) => c.code === code)
  return cc ? `${cc.code} ${cc.name} (${cc.account})` : code
}

function applyAction(inv: Invoice, action: ErpAction, note: string): Invoice {
  switch (action) {
    case 'hold':
      return { ...inv, status: 'on_hold', note }
    case 'request_approval':
      return { ...inv, approvalRequested: true, status: 'awaiting_approval', note }
    case 'post':
      return { ...inv, status: 'posted' }
  }
}

export const useErp = create<ErpState>()((set, get) => {
  /** Local first (the guardrail check needs it synchronously), then the database. */
  const save = (before: Invoice, after: Invoice) => {
    set({ invoices: { ...get().invoices, [after.id]: after } })
    const changes = diffInvoice(before, after)
    if (Object.keys(changes).length > 0) erpSync()?.patchInvoice(after.id, changes)
  }

  return {
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
      set({ blocked: null })
      save(inv, next)
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

    commit: (id, action, note = '') => {
      const inv = get().invoices[id]
      if (!inv) return { ok: false, violations: [] }
      const proposed = applyAction(inv, action, note.trim())

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

      set({ blocked: null })
      save(inv, proposed)
      emitEvent({
        source: 'dom',
        kind: 'action',
        action,
        invoiceId: id,
        targetId: actionTarget(action),
        ...(proposed.note && action !== 'post' ? { text: proposed.note } : {}),
      })
      return { ok: true, violations: [] }
    },

    dismissBlocked: () => set({ blocked: null }),

    reset: () => {
      set({ invoices: initialInvoices(), openId: null, blocked: null })
      erpSync()?.resetInvoices()
    },

    replaceFromServer: (invoices) => {
      if (invoices.length === 0) return
      set({ invoices: Object.fromEntries(invoices.map((i) => [i.id, i])) })
    },
  }
})

/** Non-React access for other modules (tutor, step tracker). */
export const erp = useErp.getState
