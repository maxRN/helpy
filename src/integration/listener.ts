// Helpy's ears in Capture mode: ElevenLabs Scribe v2 Realtime streams the microphone, its VAD tells
// us when the expert speaks and when a turn ends, and every finished turn goes into the session log.
// The pause detector reads lastSpeechAt(), so the agent only speaks in real pauses.
import { create } from 'zustand'
import { bus, emitEvent } from '../shared/bus'
import { useMascot } from '../shared/mascot'
import { session, useSession } from '../shared/session'
import type { AppEvent, Quote } from '../shared/types'
import { isDirectAddress, recordCommand, SpeechTracker, type Utterance } from './speech'

// Words Scribe should not mishear in this demo (max 20 characters each).
const KEYTERMS = ['capex', 'opex', 'ProcureFlow', 'cost center', 'asset number', 'Kramer', 'Brno', 'vendor master', 'Hartmann', 'Weber', 'second approval']

/** Seconds of silence after which Scribe's VAD ends a turn. */
export const VAD_SILENCE_SECS = 0.8

interface ListenerState {
  status: 'off' | 'connecting' | 'listening' | 'error'
  speaking: boolean
  partial: string
  muted: boolean
  error: string
}

export const useListener = create<ListenerState>(() => ({ status: 'off', speaking: false, partial: '', muted: false, error: '' }))

const tracker = new SpeechTracker()
let connection: { close(): void; mute(): void; unmute(): void } | null = null
let cleanups: Array<() => void> = []
let onAnswer: ((q: Quote) => void) | null = null
let onRecordCommand: ((cmd: 'off' | 'on') => void) | null = null
let onDirectQuestion: ((text: string) => void) | null = null

export const speech = {
  lastSpeechAt: () => tracker.lastSpeechAt(),
  isSpeaking: () => tracker.isSpeaking(),
  active: () => useListener.getState().status === 'listening',
}

const rel = (at: number) => {
  const t0 = session().t0
  return t0 === null ? undefined : Math.max(0, at - t0)
}

/** toHelpy: said to Helpy, not about the work; kept in the log but left out of the debrief and Work Map. */
function logUtterance(u: Utterance, toHelpy = false) {
  emitEvent({
    source: 'voice',
    kind: 'utterance',
    speaker: 'expert',
    text: u.text,
    t: rel(u.startedAt),
    meta: { stt: 'scribe_v2_realtime', ...(toHelpy ? { toHelpy: true } : {}) },
  })
  if (u.answersQuestionId) {
    emitEvent({
      source: 'voice',
      kind: 'answer_given',
      speaker: 'expert',
      text: u.text,
      t: rel(u.startedAt),
      meta: { questionId: u.answersQuestionId, eventId: u.aboutEventId, stt: 'scribe_v2_realtime' },
    })
    onAnswer?.({ text: u.text, t: rel(u.startedAt) ?? 0, speaker: 'expert' })
  }
}

function setMuted(muted: boolean) {
  if (!connection || useListener.getState().muted === muted) return
  if (muted) {
    connection.mute()
    tracker.dropTurn()
  } else connection.unmute()
  useListener.setState({ muted, speaking: false, partial: '' })
}

export interface ListenerCallbacks {
  /** The expert's spoken answer to the agent's latest question. */
  onAnswer?: (q: Quote) => void
  /** "Off the record" / "back on the record" said aloud (the agent's own mic is muted in Capture). */
  onRecordCommand?: (cmd: 'off' | 'on') => void
  /** The expert spoke to Helpy directly ("hörst du mich?", "Helpy, …"): Helpy should answer. */
  onDirectQuestion?: (text: string) => void
}

/** Starts listening; resolves once Scribe confirmed the session. */
export async function startListening(callbacks: ListenerCallbacks = {}): Promise<void> {
  if (connection) return
  onAnswer = callbacks.onAnswer ?? null
  onRecordCommand = callbacks.onRecordCommand ?? null
  onDirectQuestion = callbacks.onDirectQuestion ?? null
  useListener.setState({ status: 'connecting', error: '' })
  try {
    const res = await fetch('/api/elevenlabs/scribe-token')
    const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
    if (!res.ok || !body.token) throw new Error(body.error ?? `scribe-token failed (${res.status})`)

    const { Scribe, CommitStrategy, RealtimeEvents } = await import('@elevenlabs/client')
    const conn = Scribe.connect({
      token: body.token,
      modelId: 'scribe_v2_realtime',
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: VAD_SILENCE_SECS,
      keyterms: KEYTERMS,
      microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    connection = conn

    // Resolve only once Scribe confirmed the session, so callers can rely on speech.active().
    let started!: () => void
    let failed!: (e: Error) => void
    const ready = new Promise<void>((resolve, reject) => {
      started = resolve
      failed = reject
    })
    const timeout = setTimeout(() => failed(new Error('Scribe did not start within 8 s')), 8000)

    conn.on(RealtimeEvents.SESSION_STARTED, () => {
      clearTimeout(timeout)
      useListener.setState({ status: 'listening' })
      started()
    })
    conn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (m) => {
      if (session().offRecord) return
      tracker.partial(m.text, Date.now())
      useListener.setState({ speaking: tracker.isSpeaking(), partial: tracker.currentPartial() })
    })
    conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (m) => {
      const toHelpy = isDirectAddress(m.text)
      const u = tracker.committed(m.text, Date.now(), !toHelpy)
      useListener.setState({ speaking: false, partial: '' })
      if (!u) return
      // Voice commands work even while off the record (that is how "back on the record" is heard); they are never logged.
      const cmd = recordCommand(u.text)
      if (cmd) return onRecordCommand?.(cmd)
      if (session().offRecord) return
      logUtterance(u, toHelpy)
      if (toHelpy) onDirectQuestion?.(u.text)
    })
    const fail = (m: unknown) => {
      const message = (m as { error?: string; message?: string })?.error ?? (m as { message?: string })?.message ?? 'Scribe error'
      console.warn('[listener]', m)
      useListener.setState({ status: 'error', error: String(message) })
      clearTimeout(timeout)
      failed(new Error(String(message)))
    }
    conn.on(RealtimeEvents.ERROR, fail)
    conn.on(RealtimeEvents.AUTH_ERROR, fail)
    conn.on(RealtimeEvents.QUOTA_EXCEEDED, fail)
    conn.on(RealtimeEvents.CLOSE, () => {
      if (connection === conn) {
        connection = null
        useListener.setState({ status: 'off', speaking: false, partial: '' })
      }
    })

    // While Helpy talks, do not transcribe its own voice from the speakers.
    cleanups.push(useMascot.subscribe((s) => setMuted(s.state === 'speaking')))
    // Off the record: nothing is heard or kept.
    cleanups.push(useSession.subscribe((s) => (s.offRecord ? tracker.dropTurn() : undefined)))
    // The agent's question decides which next turn counts as the answer.
    const onEvent = (e: AppEvent) => {
      if (e.kind === 'question_asked') tracker.questionAsked(String(e.meta?.agentId ?? e.id), e.meta?.eventId as string | undefined, Date.now())
    }
    bus.on('event', onEvent)
    cleanups.push(() => bus.off('event', onEvent))

    await ready
  } catch (err) {
    cleanups.forEach((fn) => fn())
    cleanups = []
    connection?.close()
    connection = null
    useListener.setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

export function stopListening() {
  cleanups.forEach((fn) => fn())
  cleanups = []
  const conn = connection
  connection = null
  onAnswer = null
  onRecordCommand = null
  onDirectQuestion = null
  tracker.dropTurn()
  conn?.close()
  useListener.setState({ status: 'off', speaking: false, partial: '', muted: false })
}
