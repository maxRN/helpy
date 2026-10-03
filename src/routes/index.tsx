import { createFileRoute } from '@tanstack/react-router'
import { DebriefPanel } from '../debrief/DebriefPanel'
import { Desktop } from '../desktop/Desktop'
import { DebugPanel } from '../erp/DebugPanel'
import { ErpApp } from '../erp/ErpApp'
import { VoicePanel } from '../integration/VoicePanel'

export const Route = createFileRoute('/')({ component: Home })

// A mock desktop with the ERP as its only app; the apprentice (voice, debrief) floats on top.
function Home() {
  return (
    <>
      <Desktop app={<ErpApp />} />
      <VoicePanel />
      <DebriefPanel />
      {import.meta.env.DEV ? <DebugPanel /> : null}
    </>
  )
}
