import { createFileRoute } from '@tanstack/react-router'
import { Helpy } from '../app'
import { DebugPanel } from '../erp/DebugPanel'
import { ErpApp } from '../erp/ErpApp'

// Browser-only: the session store, screen capture and Helpy need window and localStorage.
export const Route = createFileRoute('/')({ ssr: false, component: Home })

// The ERP with Helpy on top. Max's fake desktop will wrap this; Helpy stays the same.
function Home() {
  return (
    <div className="min-h-screen">
      <ErpApp />
      <Helpy />
      {/* P1's event log and Teach shortcuts: add ?debug to the URL (dev only). */}
      {import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug') ? <DebugPanel /> : null}
    </div>
  )
}
