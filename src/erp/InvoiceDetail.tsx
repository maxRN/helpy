import { useState } from 'react'
import { COMPANY_NAME } from './seed'
import {
  APPROVERS,
  CATEGORIES,
  COST_CENTERS,
  formatDate,
  formatUSD,
  type Invoice,
} from './model'
import { StatusPill } from './StatusPill'
import { actionTarget, PREVIEW_TARGET, useErp, VENDOR_TARGET, type ErpAction } from './store'
import { SelectField, TextField } from './TrackedField'
import { useTarget } from './useTarget'

/** The supplier's invoice as a paper document. PII is tagged data-pii so capture can mask it. */
function PaperInvoice({ invoice }: { invoice: Invoice }) {
  const ref = useTarget(PREVIEW_TARGET)
  return (
    <article
      ref={ref}
      className="min-w-0 rounded-sm border border-slate-300 bg-white p-6 text-[12px] leading-relaxed text-slate-800 shadow-sm"
    >
      <header className="flex flex-wrap justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="text-[16px] font-semibold text-slate-900">{invoice.supplierName}</div>
          <div className="text-slate-600">{invoice.supplierAddress}</div>
          <div className="mt-1 text-slate-600">
            Contact: <span data-pii>{invoice.contactName}</span> · <span data-pii>{invoice.contactEmail}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-light tracking-wide text-slate-500">INVOICE</div>
          <div className="font-mono">No. {invoice.number}</div>
          <div>Date: {formatDate(invoice.invoiceDate)}</div>
          <div>Due: {formatDate(invoice.dueDate)}</div>
          {invoice.poNumber ? <div>PO: {invoice.poNumber}</div> : null}
        </div>
      </header>

      <div className="py-3 text-slate-600">
        Bill to: <span className="text-slate-800">{COMPANY_NAME}, Accounts Payable, 1200 Harbor Rd, Erie, PA 16507</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-2 font-medium">Description</th>
              <th className="py-1 pr-2 text-right font-medium">Qty</th>
              <th className="py-1 pr-2 text-right font-medium">Unit price</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5 pr-2">{l.description}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{l.qty}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatUSD(l.unitPrice)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatUSD(l.qty * l.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right font-semibold">
                Total due (USD)
              </td>
              <td className="pt-3 text-right text-[14px] font-semibold tabular-nums">{formatUSD(invoice.amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer className="mt-5 border-t border-slate-200 pt-3 text-slate-600">
        Remit to: <span data-pii>{invoice.bankAccount}</span>
      </footer>
    </article>
  )
}

const ACTIONS: { action: ErpAction; label: string; className: string }[] = [
  { action: 'hold', label: 'Hold', className: 'border-slate-400 bg-white text-slate-800 hover:bg-slate-50' },
  {
    action: 'request_approval',
    label: 'Request 2nd approval',
    className: 'border-slate-400 bg-white text-slate-800 hover:bg-slate-50',
  },
  { action: 'post', label: 'Post', className: 'border-sky-800 bg-sky-700 text-white hover:bg-sky-800' },
]

function ActionButton({
  action,
  label,
  className,
  disabled,
  active,
  onClick,
}: (typeof ACTIONS)[number] & { disabled: boolean; active: boolean; onClick: () => void }) {
  const ref = useTarget(actionTarget(action))
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`h-8 rounded-sm border px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'ring-2 ring-sky-500' : ''} ${className}`}
    >
      {label}
    </button>
  )
}

const NOTE_PROMPT: Record<Exclude<ErpAction, 'post'>, { label: string; placeholder: string; confirm: string }> = {
  hold: { label: 'Reason for hold', placeholder: 'e.g. possible duplicate, ask controller', confirm: 'Confirm hold' },
  request_approval: { label: 'Note for the approver', placeholder: 'e.g. intercompany, second check', confirm: 'Send for approval' },
}

/** Post commits at once; Hold and 2nd approval first ask for a short reason (optional, Enter confirms). */
function Actions({ invoiceId, locked }: { invoiceId: string; locked: boolean }) {
  const commit = useErp((s) => s.commit)
  const [pending, setPending] = useState<Exclude<ErpAction, 'post'> | null>(null)
  const [note, setNote] = useState('')

  const confirm = () => {
    if (!pending) return
    commit(invoiceId, pending, note)
    setPending(null)
    setNote('')
  }

  return (
    <div className="mt-1 flex flex-col gap-2 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <ActionButton
            key={a.action}
            {...a}
            disabled={locked}
            active={pending === a.action}
            onClick={() => {
              if (a.action === 'post') {
                setPending(null)
                commit(invoiceId, 'post')
              } else {
                setPending(a.action)
              }
            }}
          />
        ))}
      </div>
      {pending ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm bg-slate-50 p-2">
          <label htmlFor="action-note" className="text-[12px] font-medium text-slate-600">
            {NOTE_PROMPT[pending].label}
          </label>
          <input
            id="action-note"
            autoFocus
            value={note}
            placeholder={NOTE_PROMPT[pending].placeholder}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm()
              if (e.key === 'Escape') setPending(null)
            }}
            className="h-8 min-w-0 flex-1 rounded-sm border border-slate-300 bg-white px-2 text-[13px] outline-none focus:border-sky-600"
          />
          <button type="button" onClick={confirm} className="h-8 rounded-sm bg-slate-800 px-3 text-[13px] font-medium text-white hover:bg-slate-900">
            {NOTE_PROMPT[pending].confirm}
          </button>
          <button type="button" onClick={() => setPending(null)} className="text-[12px] text-slate-600 hover:underline">
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  )
}

function VendorStatus({ verified }: { verified: boolean }) {
  const ref = useTarget(VENDOR_TARGET)
  return (
    <span
      ref={ref}
      className={`inline-flex w-fit rounded-sm px-1.5 py-0.5 text-[12px] font-medium ${verified ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}
    >
      {verified ? 'Verified' : 'Not in vendor master'}
    </span>
  )
}

function BlockedBanner({ invoiceId }: { invoiceId: string }) {
  const blocked = useErp((s) => (s.blocked?.invoiceId === invoiceId ? s.blocked : null))
  const dismiss = useErp((s) => s.dismissBlocked)
  if (!blocked) return null
  return (
    <div role="alert" className="rounded-sm border border-red-300 bg-red-50 p-3 text-[13px] text-red-900">
      <div className="font-semibold">Posting stopped by a guardrail</div>
      <ul className="mt-1 flex flex-col gap-2">
        {blocked.violations.map((v) => (
          <li key={v.guardrail.id}>
            <div>{v.guardrail.text}</div>
            <blockquote className="mt-0.5 italic text-red-800">
              “{v.guardrail.quote.text}” — Sabine
            </blockquote>
          </li>
        ))}
      </ul>
      <button type="button" onClick={dismiss} className="mt-2 text-[12px] underline">
        Fix it and try again
      </button>
    </div>
  )
}

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const invoice = useErp((s) => s.invoices[invoiceId])
  const open = useErp((s) => s.open)
  if (!invoice) return null

  const locked = invoice.status === 'posted'
  const account = COST_CENTERS.find((c) => c.code === invoice.costCenter)?.account ?? 'opex'

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => open(null)} className="text-[13px] text-sky-700 hover:underline">
          ← Supplier invoices
        </button>
        <h2 className="text-[15px] font-semibold text-slate-900">
          Invoice <span className="font-mono">{invoice.number}</span> · {invoice.supplierName}
        </h2>
        <StatusPill status={invoice.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <PaperInvoice invoice={invoice} />

        <div className="flex min-w-0 flex-col gap-3 rounded-sm border border-slate-300 bg-white p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Coding</h3>
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-[12px] font-medium text-slate-600">Supplier ID</dt>
            <dd className="font-mono">{invoice.supplierId}</dd>
            <dt className="text-[12px] font-medium text-slate-600">Vendor master</dt>
            <dd>
              <VendorStatus verified={invoice.supplierVerified} />
            </dd>
            <dt className="text-[12px] font-medium text-slate-600">Country</dt>
            <dd>{invoice.supplierCountry}</dd>
            <dt className="text-[12px] font-medium text-slate-600">Amount</dt>
            <dd className="font-mono tabular-nums">{formatUSD(invoice.amount)}</dd>
          </dl>

          <SelectField
            invoiceId={invoiceId}
            field="category"
            label="Category"
            options={CATEGORIES}
            disabled={locked}
          />
          <SelectField
            invoiceId={invoiceId}
            field="costCenter"
            label="Cost center"
            options={COST_CENTERS.map((c) => ({ value: c.code, label: `${c.code} – ${c.name}` }))}
            disabled={locked}
            hint={
              <>
                GL account: <span className="font-medium uppercase">{account}</span>
              </>
            }
          />
          <TextField
            invoiceId={invoiceId}
            field="assetNumber"
            label="Asset no."
            placeholder="e.g. A-2025-117"
            disabled={locked}
          />
          <SelectField
            invoiceId={invoiceId}
            field="approver"
            label="Approver"
            options={APPROVERS.map((a) => ({ value: a, label: a || '— none —' }))}
            disabled={locked}
          />

          {invoice.note ? (
            <div className="rounded-sm bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
              <span className="font-medium">{invoice.status === 'on_hold' ? 'Hold reason' : 'Note'}:</span> {invoice.note}
            </div>
          ) : null}

          <BlockedBanner invoiceId={invoiceId} />

          <Actions invoiceId={invoiceId} locked={locked} />
        </div>
      </div>
    </section>
  )
}
