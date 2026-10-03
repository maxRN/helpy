import { createFileRoute } from '@tanstack/react-router'
import { DebugPanel } from '../erp/DebugPanel'
import { ErpApp } from '../erp/ErpApp'

export const Route = createFileRoute('/')({ component: Home })

// Temporary page until P4's app shell lands: the ERP plus the dev event log.
function Home() {
  return (
    <div className="min-h-screen">
      <ErpApp />
      {import.meta.env.DEV ? <DebugPanel /> : null}
    </div>
  )
}
