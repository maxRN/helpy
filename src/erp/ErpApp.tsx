import { useEffect } from 'react'
import { installActivityTracker } from '../shared/activity'
import { InvoiceDetail } from './InvoiceDetail'
import { InvoiceInbox } from './InvoiceInbox'
import { COMPANY_NAME } from './seed'
import { installStepTracker } from './stepTracker'
import { useErp } from './store'

/** The mini ERP ("ProcureFlow"). Mount it once inside the app shell. */
export function ErpApp() {
  const openId = useErp((s) => s.openId)

  useEffect(() => {
    void useErp.persist.rehydrate()
    installActivityTracker()
    installStepTracker()
  }, [])

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-[#f2f4f6] text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-[#2f3e4f] px-4 py-2 text-white">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold tracking-tight">ProcureFlow</span>
          <span className="text-[12px] text-slate-300">{COMPANY_NAME} · Accounts Payable</span>
        </div>
        <div className="text-[12px] text-slate-300">
          Posting period <span className="font-medium text-white">Dec 2025</span> · Close in{' '}
          <span className="font-medium text-amber-300">2 days</span> · Signed in as S. Brandt
        </div>
      </header>
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        {openId ? <InvoiceDetail invoiceId={openId} /> : <InvoiceInbox />}
      </main>
    </div>
  )
}
