import { useConvex } from 'convex/react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useTaskRecording } from '../capture/TaskRecorder'
import { useListener } from '../integration/listener'
import { activity } from '../shared/activity'
import { mascot, MascotLayer, setMascotClickHandler } from '../mascot'
import { mascot as sharedMascot, useMascot } from '../shared/mascot'
import { useSession } from '../shared/session'
import { TeachLayer } from '../teach-ui/TeachLayer'
import { nameRecording } from './autoName'
import { installBubbleLifecycle } from './bubbleLifecycle'
import { HelpyApp } from './helpy-app/HelpyApp'
import { HelpyPanel } from './panel/HelpyPanel'
import { panel, usePanel } from './panel/store'
import { askQuestions } from './panel/questions'
import { mmss } from './panel/ui'
import { offRecordPrompt } from './offRecordPrompt'
import { RecordDialog, recordFlow } from './RecordDialog'
import { tour } from './tour'
import { useVoiceDebrief, VoiceDebrief, voiceDebrief } from './VoiceDebrief'
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

/** Why a held question is not asked yet: the same signals the pause detector uses (typing, Scribe's open turn). */
function useWaitReason() {
  const talking = useListener((s) => s.speaking)
  const [busy, setBusy] = useState<'typing' | 'mid-step' | null>(null)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      setBusy(now - activity.lastTypingAt() < 2500 ? 'typing' : now - activity.lastFieldAt() < 4000 ? 'mid-step' : null)
    }, 500)
    return () => clearInterval(timer)
  }, [])
  return talking ? 'you’re talking' : busy === 'typing' ? 'you’re typing' : busy === 'mid-step' ? 'you’re mid-step' : 'at your next pause'
}

/** Helpy has a question but you are busy: a quiet line that says why it waits. No sound, no blinking. */
function QuestionLine() {
  const why = useWaitReason()
  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold text-[#f5c565]">
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#f5b83d] text-[10px] font-bold text-[#3d2a00]" aria-hidden>
        ?
      </span>
      <span className="truncate">Question · {why === 'at your next pause' ? why : `waiting, ${why}`}</span>
    </div>
  )
}

/** The end of a long sentence, cut at a word: the newest words are the ones worth reading. */
function tailOf(text: string, max = 140) {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= max) return clean
  const cut = clean.slice(-max)
  const space = cut.indexOf(' ')
  return `…${space > 0 && space < 30 ? cut.slice(space + 1) : cut}`
}

/** After a sentence ends, what Helpy heard stays this long, so the card does not blink between sentences. */
const HEARD_LINGER_MS = 2500

/** What Helpy hears right now (ElevenLabs Scribe v2 Realtime): live while the expert talks, then briefly after. */
function useHeard(): string {
  const { speaking, partial } = useListener()
  const [heard, setHeard] = useState('')
  useEffect(() => {
    if (speaking && partial.trim()) return setHeard(partial)
    const timer = setTimeout(() => setHeard(''), HEARD_LINGER_MS)
    return () => clearTimeout(timer)
  }, [speaking, partial])
  return heard
}

/**
 * The card above the robot while it records: what it hears and a question it holds back. Fixed width, newest words at
 * the bottom, at most three lines (older lines leave at the top); nothing at all when there is nothing to show.
 */
function StatusCard({ waiting }: { waiting: boolean }) {
  const heard = useHeard()
  const live = useListener((s) => s.speaking)
  if (!heard && !waiting) return null
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-helpy-ink/90 px-3 py-2 text-white shadow-soft backdrop-blur-sm">
      {heard ? (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-white/60 uppercase">
            <span className={`size-1.5 rounded-full ${live ? 'bg-helpy-mint' : 'bg-white/40'}`} aria-hidden />
            Helpy hears
          </div>
          <div className="mt-0.5 flex max-h-[3lh] flex-col justify-end overflow-hidden text-[13px] leading-snug break-words">
            <p className="m-0">{tailOf(heard, 200)}</p>
          </div>
        </div>
      ) : null}
      {waiting ? <QuestionLine /> : null}
    </div>
  )
}

/** After this long with a question held back, Helpy says so quietly in its bubble (it never speaks over you). */
const NUDGE_AFTER_MS = 40_000

/** Robot click: while recording, the controls in the bubble; otherwise the panel. */
function onRobotClick() {
  // A lesson paused off the record: the way back ("Continue"), whatever else was shown since.
  if (offRecordPrompt.active()) return offRecordPrompt.show()
  // While recording or in the debrief the controls show in the bubble; a second click puts them away.
  const busy = usePanel.getState().activity?.kind === 'recording' || voiceDebrief.active()
  if (busy && mascot.resolve('prompt')) return
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
    const uninstallBubbles = installBubbleLifecycle()
    // Someone Helpy has never seen: it comes to the middle, says hello and offers a tour.
    const uninstallTour = tour.install()
    const uninstallOffRecord = offRecordPrompt.install()
    // Dev console: helpy.mascot.pointTo('field-costCenter'), helpy.panel.show(), helpy.question('Why 0400?')
    if (import.meta.env.DEV) Object.assign(window, { helpy: { mascot, panel, question: sharedMascot.waiting } })
    return () => {
      uninstallTour()
      uninstallOffRecord()
      setMascotClickHandler(null)
      uninstallBubbles()
    }
  }, [])

  // The tutor asks to replay Sabine's moment (show_expert_clip).
  useEffect(() => {
    if (clipRequest) panel.show({ name: 'moment', stepId: clipRequest.stepId })
  }, [clipRequest])

  // End of a recording, from "I'm done" or the browser's "Stop sharing": thank, then ask the follow-up questions.
  const { state: recorder, error } = useTaskRecording()
  const convex = useConvex()
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
        mascot.bubble('Thank you! I have a few questions about what I saw.')
        // Claude names the process from what was done (it can be renamed later in Helpy's app).
        void nameRecording(convex, current.processId)
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
          topic: 'waiting',
          actions: [{ label: 'Ask me now', primary: true, onClick: () => void askWaitingQuestion() }],
        })
      },
      Math.max(0, waiting.since + NUDGE_AFTER_MS - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [waiting, activity?.kind])

  // The follow-up questions listen with the same ears: what Helpy hears shows there too.
  const debriefing = useVoiceDebrief((s) => s.phase !== 'idle')

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
        badge={activity?.kind === 'recording' ? <RecordingLight startedAt={'task' in recorder ? recorder.task.startedAt : null} /> : null}
        status={activity?.kind === 'recording' ? <StatusCard waiting={!!waiting} /> : debriefing ? <StatusCard waiting={false} /> : null}
      />
      <HelpyPanel boundsRef={boundsRef} />
      <RecordDialog />
      <VoiceDebrief />
      {teaching ? <TeachLayer onCaseDone={onCaseDone} /> : null}
    </>
  )
}
