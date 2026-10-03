import { createFileRoute, Link } from '@tanstack/react-router'
import { DebriefPanel } from '../debrief/DebriefPanel'
import { DebugPanel } from '../erp/DebugPanel'
import { ErpApp } from '../erp/ErpApp'
import { VoicePanel } from '../integration/VoicePanel'

export const Route = createFileRoute('/')({ component: Home })

// Temporary page until P4's app shell lands: the ERP plus the dev event log.
function Home() {
  return (
    <div className="min-h-screen">
      <nav className="border-b border-slate-200 bg-white px-6 py-3 text-sm">
        <Link to="/projects" className="font-medium text-indigo-700 hover:underline">Projects</Link>
      </nav>
      <ErpApp />
      <VoicePanel />
      <DebriefPanel />
      {import.meta.env.DEV ? <DebugPanel /> : null}
    </div>
  )
}
