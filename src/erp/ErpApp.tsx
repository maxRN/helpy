import { useEffect, useState } from 'react'
import { installAudioUnlock } from '../integration/audioUnlock'
import { installActivityTracker } from '../shared/activity'
import { registry } from '../shared/registry'
import { registerAppScreen } from '../shared/screen'
import { useSession } from '../shared/session'
import { ConvexSync } from './ConvexSync'
import { InvoiceDetail } from './InvoiceDetail'
import { InvoiceInbox } from './InvoiceInbox'
import { COMPANY_NAME } from './seed'
import { installStepTracker, resetStepTracker } from './stepTracker'
import { describeErpScreen } from './screenSnapshot'
import { erp, useErp } from './store'

/** On screen = mounted and not hidden (a minimized window keeps its elements but renders no boxes). */
const onScreen = (targetId: string) => (registry.get(targetId)?.getClientRects().length ?? 0) > 0

/** Two clicks so nobody wipes the invoices by accident mid-demo. Keeps the Work Map and the event log. */
function ResetDemoButton() {
  const reset = useErp((s) => s.reset)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) return setArmed(true)
        reset()
        resetStepTracker()
        setArmed(false)
      }}
      className={`rounded-sm px-2 py-0.5 text-[11px] ${armed ? 'bg-amber-400 text-slate-900' : 'text-slate-400 hover:text-white'}`}
    >
      {armed ? 'Click again to reset invoices' : 'Reset demo'}
    </button>
  )
}

/**
 * Everything that must run whether or not the ERP window is open: the database sync (invoices,
 * Work Maps, events), the saved session, and input/step tracking. Mount once at the app root.
 */
export function ErpServices() {
  useEffect(() => {
    installAudioUnlock() // before any voice code creates an AudioContext
    void useSession.persist.rehydrate()
    installActivityTracker()
    installStepTracker()
    // Helpy always knows what ProcureFlow shows, in every mode (Capture, debrief, Teach).
    registerAppScreen(() => {
      const { invoices, openId, blocked } = erp()
      return describeErpScreen({ invoices, openId, visible: onScreen, blockedBy: blocked?.violations.map((v) => v.guardrail.text) })
    })
    return () => registerAppScreen(null)
  }, [])
  return <ConvexSync />
}

/** The mini ERP ("ProcureFlow"), shown inside the desktop window. Needs <ErpServices /> at the root. */
export function ErpApp() {
  const openId = useErp((s) => s.openId)
  const user = useSession((s) => (s.mode === 'teach' ? 'L. Hoffmann (new hire)' : 'S. Brandt'))

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-[#f2f4f6] text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-[#2f3e4f] px-4 py-2 text-white">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold tracking-tight">ProcureFlow</span>
          <span className="text-[12px] text-slate-300">{COMPANY_NAME} · Accounts Payable</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-300">
          <span>
            Posting period <span className="font-medium text-white">Dec 2025</span> · Close in{' '}
            <span className="font-medium text-amber-300">2 days</span> · Signed in as {user}
          </span>
          <ResetDemoButton />
        </div>
      </header>
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        {openId ? <InvoiceDetail invoiceId={openId} /> : <InvoiceInbox />}
      </main>
    </div>
  )
}
