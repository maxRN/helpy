import { ALL_INVOICES } from '../erp/seed'
import { useErp } from '../erp/store'
import { diffInvoice, erpSync } from '../erp/sync'

/** Puts the cases Sabine never showed back to their starting state, so every practice run starts fresh. Sabine's invoices stay as they are. */
export function resetPracticeCases() {
  const { invoices } = useErp.getState()
  const next = { ...invoices }
  for (const seed of ALL_INVOICES) {
    if (!seed.teachOnly) continue
    const current = invoices[seed.id]
    if (!current) continue
    const changes = diffInvoice(current, seed)
    if (Object.keys(changes).length === 0) continue
    next[seed.id] = structuredClone(seed)
    erpSync()?.patchInvoice(seed.id, changes)
  }
  useErp.setState({ invoices: next, openId: null, blocked: null })
}
