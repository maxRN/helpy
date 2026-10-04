import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useTaskRecording } from '../capture/TaskRecorder'
import { useListener } from '../integration/listener'
import { mascot, MascotLayer, setMascotClickHandler } from '../mascot'
import { mascot as sharedMascot, useMascot } from '../shared/mascot'
import { useSession } from '../shared/session'
import { TeachLayer } from '../teach-ui/TeachLayer'
import { auth, useAuth } from './auth'
import { HelpyApp } from './helpy-app/HelpyApp'
import { HelpyPanel } from './panel/HelpyPanel'
import { panel, usePanel } from './panel/store'
import { askQuestions } from './panel/questions'
import { mmss } from './panel/ui'
import { RecordDialog, recordFlow } from './RecordDialog'
import { VoiceDebrief, voiceDebrief } from './VoiceDebrief'
import { askWaitingQuestion, stopVoice } from './voice'

/** Small red light with the time on the robot while it records. */
function RecordingLight({ startedAt }: { startedAt: number | null }) {
  const offRecord = useSession((s) => s.offRecord)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap text-white tabular-nums shadow-soft ${offRecord ? 'bg-faint' : 'bg-[#e5484d]'}`}>
      <span className={`size-1.5 rounded-full bg-white ${offRecord ? '' : 'animate-pulse'}`} aria-hidden />
      {offRecord ? 'PAUSED' : `REC${startedAt ? ` ${mmss(now - startedAt)}` : ''}`}
    </span>
  )
}

/** Helpy has a question but you are busy: a quiet sign above the robot, no sound, no blinking. */
function QuestionSign() {
  return (
    <span className="helpy-pop flex items-center gap-1 rounded-full bg-[#f5b83d] px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-[#3d2a00] shadow-soft">
      <span aria-hidden>?</span> Question
    </span>
  )
}

/** What Helpy hears right now (ElevenLabs Scribe v2 Realtime), live while the expert talks. */
function HearingCaption() {
  const { speaking, partial } = useListener()
  if (!speaking || !partial) return null
  return <span className="block max-w-[240px] truncate rounded-full bg-helpy-ink/85 px-2.5 py-0.5 text-[12px] text-white shadow-soft">I hear: “{partial}”</span>
}

/** After this long with a question held back, Helpy says so quietly in its bubble (it never speaks over you). */
const NUDGE_AFTER_MS = 40_000

/** Robot click: sign in first; while recording, the controls in the bubble; otherwise the panel. */
function onRobotClick() {
  if (!auth.user()) return panel.toggle()
  if (usePanel.getState().activity?.kind === 'recording') return recordFlow.controls()
  if (voiceDebrief.active()) return voiceDebrief.controls()
  if (recordFlow.active()) return
  panel.toggle()
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
    setMascotClickHandler(onRobotClick)
    // Dev console: helpy.mascot.pointTo('field-costCenter'), helpy.panel.show(), helpy.question('Why 0400?')
    if (import.meta.env.DEV) Object.assign(window, { helpy: { mascot, panel, question: sharedMascot.waiting } })
    // Helpy just started on this computer: say hello and ask who is working.
    const hello = auth.user()
      ? undefined
      : setTimeout(() => {
          mascot.pose('wave', 2600)
          panel.show({ name: 'signin' })
        }, 600)
    return () => {
      clearTimeout(hello)
      setMascotClickHandler(null)
    }
  }, [])

  // The tutor asks to replay Sabine's moment (show_expert_clip).
  useEffect(() => {
    if (clipRequest) panel.show({ name: 'moment', stepId: clipRequest.stepId })
  }, [clipRequest])

  // End of a recording, from "I'm done" or the browser's "Stop sharing": thank, then ask the follow-up questions.
  const { state: recorder, error } = useTaskRecording()
  const wasRecording = useRef(false)
  useEffect(() => {
    const recording = recorder.kind !== 'idle'
    const current = usePanel.getState().activity
    if (wasRecording.current && !recording && current?.kind === 'recording') {
      panel.setActivity(null)
      sharedMascot.waiting(null)
      if (error) {
        mascot.setState('idle')
        mascot.bubble(`Recording stopped because of an error: ${error}`)
        void stopVoice()
      } else {
        mascot.setState('speaking')
        mascot.pose('cheer', 2200)
        mascot.bubble('Thank you! I have a few questions about what I saw.', { ttlMs: 5000 })
        void stopVoice().then(() => setTimeout(askQuestions, 1500))
      }
    }
    wasRecording.current = recording
  }, [recorder.kind, error])

  // A question held back for a while: say so quietly, with "Ask me now". Never out loud, never over the expert.
  const waiting = useMascot((s) => s.waiting)
  useEffect(() => {
    if (!waiting || activity?.kind !== 'recording') return
    const timer = setTimeout(
      () => {
        if (useMascot.getState().bubble) return // something else is being said
        mascot.bubble('I have a question for you. No rush, I’ll ask when you pause.', {
          ttlMs: 15_000,
          actions: [{ label: 'Ask me now', primary: true, onClick: () => void askWaitingQuestion() }],
        })
      },
      Math.max(0, waiting.since + NUDGE_AFTER_MS - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [waiting, activity?.kind])

  // Signed out (e.g. "Sign out" in the panel): back to the sign-in.
  const signedIn = useAuth((s) => s.user !== null)
  useEffect(() => {
    if (!signedIn) mascot.reset()
  }, [signedIn])

  // Teach mode can start from Helpy or from P3's debrief panel; the guidance runs in both cases.
  const teaching = useSession((s) => s.mode === 'teach' && s.workMap !== null)

  const onCaseDone = useCallback(() => {
    setTimeout(() => panel.show({ name: 'report' }), 2500)
  }, [])

  return (
    <>
      <HelpyApp />
      <MascotLayer
        boundsRef={boundsRef}
        hideBubble={open}
        badge={
          activity?.kind === 'recording' ? (
            <div className="flex flex-col items-center gap-1">
              <HearingCaption />
              {waiting ? <QuestionSign /> : null}
              <RecordingLight startedAt={'task' in recorder ? recorder.task.startedAt : null} />
            </div>
          ) : null
        }
      />
      <HelpyPanel boundsRef={boundsRef} />
      <RecordDialog />
      <VoiceDebrief />
      {teaching ? <TeachLayer onCaseDone={onCaseDone} /> : null}
    </>
  )
}
