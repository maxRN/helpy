import { useMemo } from 'react'
import { useSession } from '../shared/session'
import { formatDate, formatEUR, type Invoice } from './model'
import { StatusPill } from './StatusPill'
import { rowTarget, useErp } from './store'
import { useTarget } from './useTarget'

const STATUS_ORDER = { open: 0, on_hold: 1, awaiting_approval: 2, posted: 3 } as const

function Row({ invoice }: { invoice: Invoice }) {
  const open = useErp((s) => s.open)
  const ref = useTarget(rowTarget(invoice.id))
  return (
    <tr
      ref={ref}
      onClick={() => open(invoice.id)}
      className="cursor-pointer border-b border-slate-200 hover:bg-sky-50 focus-within:bg-sky-50"
    >
      <td className="px-3 py-2">
        <button type="button" className="font-mono text-sky-700 underline-offset-2 hover:underline">
          {invoice.number}
        </button>
      </td>
      <td className="px-3 py-2 text-slate-900">{invoice.supplierName}</td>
      <td className="px-3 py-2 text-slate-600">{formatDate(invoice.invoiceDate)}</td>
      <td className="px-3 py-2 text-slate-600">{invoice.poNumber || '—'}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">{formatEUR(invoice.amount)}</td>
      <td className="px-3 py-2">
        <StatusPill status={invoice.status} />
      </td>
    </tr>
  )
}

export function InvoiceInbox() {
  const invoices = useErp((s) => s.invoices)
  const mode = useSession((s) => s.mode)

  const rows = useMemo(
    () =>
      Object.values(invoices)
        // The teach case only exists for the trainee; Sabine's demo invoices stay visible for context.
        .filter((i) => (mode === 'teach' ? true : !i.teachOnly))
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.number.localeCompare(a.number)),
    [invoices, mode],
  )
  const openCount = rows.filter((r) => r.status === 'open').length
  const openTotal = rows.filter((r) => r.status === 'open').reduce((s, r) => s + r.amount, 0)

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Supplier invoices</h2>
          <p className="text-[12px] text-slate-600">
            {openCount} open · {formatEUR(openTotal)} to process before close
          </p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-sm border border-slate-300 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead className="bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 font-medium">Supplier</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">PO</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <Row key={inv.id} invoice={inv} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
