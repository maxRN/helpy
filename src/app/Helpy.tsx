import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useTaskRecording } from '../capture/TaskRecorder'
import { mascot, MascotLayer, setMascotClickHandler } from '../mascot'
import { useMascot } from '../shared/mascot'
import { useSession } from '../shared/session'
import { TeachLayer } from '../teach-ui/TeachLayer'
import { HelpyPanel } from './panel/HelpyPanel'
import { panel, usePanel } from './panel/store'
import { stopVoice } from './voice'

/** Small red light on the robot while it records. */
function RecordingLight() {
  const offRecord = useSession((s) => s.offRecord)
  return (
    <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-soft ${offRecord ? 'bg-faint' : 'bg-[#e5484d]'}`}>
      <span className={`size-1.5 rounded-full bg-white ${offRecord ? '' : 'animate-pulse'}`} aria-hidden />
      {offRecord ? 'PAUSED' : 'REC'}
    </span>
  )
}

/**
 * Helpy, the apprentice that sits on the screen. In the product it is an app installed on the
 * computer; here it lives on top of the simulated desktop. Mount it once, above the ERP.
 * `boundsRef` is the area Helpy may move in (the fake screen); default: the whole window.
 */
export function Helpy({ boundsRef }: { boundsRef?: RefObject<HTMLElement | null> }) {
  const open = usePanel((s) => s.open)
  const activity = usePanel((s) => s.activity)
  const clipRequest = useMascot((s) => s.clipRequest)

  useEffect(() => {
    setMascotClickHandler(panel.toggle)
    // Personal data on screen is blurred, so it never reaches a screenshot or a model.
    document.documentElement.setAttribute('data-privacy-shield', '')
    // Dev console: helpy.mascot.pointTo('field-costCenter'), helpy.panel.show()
    if (import.meta.env.DEV) Object.assign(window, { helpy: { mascot, panel } })
    return () => {
      setMascotClickHandler(null)
      document.documentElement.removeAttribute('data-privacy-shield')
    }
  }, [])

  // The tutor asks to replay Sabine's moment (show_expert_clip).
  useEffect(() => {
    if (clipRequest) panel.show({ name: 'moment', stepId: clipRequest.stepId })
  }, [clipRequest])

  // End of a recording, from "I'm done" or the browser's "Stop sharing": thank, then show what Helpy is writing down.
  const { state: recorder } = useTaskRecording()
  const wasRecording = useRef(false)
  useEffect(() => {
    const recording = recorder.kind !== 'idle'
    const current = usePanel.getState().activity
    if (wasRecording.current && !recording && current?.kind === 'recording') {
      void stopVoice()
      panel.setActivity(null)
      mascot.setState('thinking')
      mascot.bubble('Thank you! I’m writing it all down now.', { ttlMs: 6000 })
      panel.show({ name: 'process', processId: current.processId })
    }
    wasRecording.current = recording
  }, [recorder.kind])

  const onCaseDone = useCallback(() => {
    setTimeout(() => panel.show({ name: 'report' }), 2500)
  }, [])

  return (
    <>
      <MascotLayer boundsRef={boundsRef} hideBubble={open} badge={activity?.kind === 'recording' ? <RecordingLight /> : null} />
      <HelpyPanel boundsRef={boundsRef} />
      {activity?.kind === 'learning' ? <TeachLayer onCaseDone={onCaseDone} /> : null}
    </>
  )
}
