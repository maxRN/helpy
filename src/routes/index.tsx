import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'
import { Helpy } from '../app'
import { DebriefPanel } from '../debrief/DebriefPanel'
import { Desktop } from '../desktop/Desktop'
import { DebugPanel } from '../erp/DebugPanel'
import { ErpApp, ErpServices } from '../erp/ErpApp'

// Browser-only: the session store, screen capture and Helpy need window and localStorage.
export const Route = createFileRoute('/')({ ssr: false, component: Home })

// A mock desktop with the ERP as its only app; Helpy, the apprentice, sits on top of everything.
function Home() {
  const screen = useRef<HTMLDivElement>(null)
  return (
    <>
      {/* Database sync, saved session and tracking run even while the ERP window is closed. */}
      <ErpServices />
      <Desktop app={<ErpApp />} />
      {/* Helpy moves anywhere on the screen except over the taskbar (h-12). */}
      <div ref={screen} className="pointer-events-none fixed inset-x-0 top-0 bottom-12" aria-hidden />
      <Helpy boundsRef={screen} />
      <DebriefPanel />
      {/* P1's event log and Teach shortcuts: add ?debug to the URL (dev only). */}
      {import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug') ? <DebugPanel /> : null}
    </>
  )
}
