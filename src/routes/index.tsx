import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'
import { Helpy } from '../app'
import { Desktop } from '../desktop/Desktop'
import { DebugPanel } from '../erp/DebugPanel'
import { ErpApp, ErpServices } from '../erp/ErpApp'

// Browser-only: the session store, screen capture and Helpy need window and localStorage.
export const Route = createFileRoute('/')({ ssr: false, component: Home })

// A mock desktop with the ERP and Helpy; Helpy, the apprentice, sits on top of everything.
function Home() {
  const screen = useRef<HTMLDivElement>(null)
  return (
    <>
      {/* Database sync, saved session and tracking run even while the ERP window is closed. */}
      <ErpServices />
      <Desktop app={<ErpApp />} />
      {/* Helpy moves anywhere on the screen except over the menu bar (h-7) and the dock (h-12). */}
      <div ref={screen} className="pointer-events-none fixed inset-x-0 top-7 bottom-12" aria-hidden />
      <Helpy boundsRef={screen} />
      {/* P1's event log and Teach shortcuts: add ?debug to the URL (dev only). */}
      {import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug') ? <DebugPanel /> : null}
    </>
  )
}
