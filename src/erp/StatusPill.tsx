import { STATUS_LABEL, type InvoiceStatus } from './model'

const STYLES: Record<InvoiceStatus, string> = {
  open: 'bg-sky-50 text-sky-800 ring-sky-200',
  on_hold: 'bg-amber-50 text-amber-800 ring-amber-300',
  awaiting_approval: 'bg-violet-50 text-violet-800 ring-violet-200',
  posted: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
}

export function StatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
