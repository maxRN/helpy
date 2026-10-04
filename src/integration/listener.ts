// Helpy's ears in Capture mode: ElevenLabs Scribe v2 Realtime streams the microphone, its VAD tells
// us when the expert speaks and when a turn ends, and every finished turn goes into the session log.
// The pause detector reads lastSpeechAt(), so the agent only speaks in real pauses.
import { create } from 'zustand'
import { bus, emitEvent } from '../shared/bus'
import { useMascot } from '../shared/mascot'
import { session, useSession } from '../shared/session'
import type { AppEvent, Quote } from '../shared/types'
import { mightBeToHelpy, recordCommand, SpeechTracker, type Utterance } from './speech'

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
let onMaybeToHelpy: ((text: string) => Promise<boolean>) | null = null

const DECIDE_TIMEOUT_MS = 8000 // if Claude takes longer, treat the turn as narration

/** Finished turns that might be meant for Helpy and are still being decided (or answered). */
let deciding = 0

export const speech = {
  lastSpeechAt: () => tracker.lastSpeechAt(),
  /** The expert is mid-turn: Scribe heard speech and has not committed the turn yet (no endpoint). */
  isSpeaking: () => tracker.isSpeaking(),
  /** A turn might be addressed to Helpy: Claude decides, and Helpy may be about to answer. */
  replyPending: () => deciding > 0,
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

/**
 * A finished turn: if it might be meant for Helpy, Claude decides (and Helpy answers); otherwise, or if it
 * was about the work, it is logged as narration and may answer the agent's pending question.
 */
async function handleTurn(u: Utterance) {
  let toHelpy = false
  if (onMaybeToHelpy && mightBeToHelpy(u.text)) {
    deciding++
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      toHelpy = await Promise.race([
        onMaybeToHelpy(u.text).catch(() => false),
        new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), DECIDE_TIMEOUT_MS))),
      ])
    } finally {
      clearTimeout(timer)
      deciding--
    }
  }
  logUtterance(toHelpy ? u : tracker.claimAnswer(u), toHelpy)
}

const MAX_MUTED_MS = 30_000 // Helpy never talks this long; if its "speaking" state sticks, listen again anyway
let muteTimer: ReturnType<typeof setTimeout> | undefined

function setMuted(muted: boolean) {
  if (!connection || useListener.getState().muted === muted) return
  clearTimeout(muteTimer)
  if (muted) {
    connection.mute()
    tracker.dropTurn()
    muteTimer = setTimeout(() => setMuted(false), MAX_MUTED_MS)
  } else connection.unmute()
  useListener.setState({ muted, speaking: false, partial: '' })
}

export interface ListenerCallbacks {
  /** The expert's spoken answer to the agent's latest question. */
  onAnswer?: (q: Quote) => void
  /** "Off the record" / "back on the record" said aloud (the agent's own mic is muted in Capture). */
  onRecordCommand?: (cmd: 'off' | 'on') => void
  /** Might be meant for Helpy: decide (and answer if so); resolve true when it was addressed to Helpy. */
  onMaybeToHelpy?: (text: string) => Promise<boolean>
}

/** Starts listening; resolves once Scribe confirmed the session. */
export async function startListening(callbacks: ListenerCallbacks = {}): Promise<void> {
  if (connection) return
  onAnswer = callbacks.onAnswer ?? null
  onRecordCommand = callbacks.onRecordCommand ?? null
  onMaybeToHelpy = callbacks.onMaybeToHelpy ?? null
  useListener.setState({ status: 'connecting', error: '' })
  try {
    const res = await fetch('/api/elevenlabs/scribe-token', { signal: AbortSignal.timeout(8000) })
    const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
    if (!res.ok || !body.token) throw new Error(body.error ?? `scribe-token failed (${res.status})`)

    const { Scribe, CommitStrategy, RealtimeEvents } = await import('@elevenlabs/client')
    const conn = Scribe.connect({
      token: body.token,
      modelId: 'scribe_v2_realtime',
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: VAD_SILENCE_SECS,
      // Only German and English: free language detection heard German narration as Polish.
      languageCode: 'de',
      secondaryLanguages: ['en'],
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
      const u = tracker.committed(m.text, Date.now())
      useListener.setState({ speaking: false, partial: '' })
      if (!u) return
      // Voice commands work even while off the record (that is how "back on the record" is heard); they are never logged.
      const cmd = recordCommand(u.text)
      if (cmd) return onRecordCommand?.(cmd)
      if (session().offRecord) return
      void handleTurn(u)
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
  onMaybeToHelpy = null
  tracker.dropTurn()
  conn?.close()
  useListener.setState({ status: 'off', speaking: false, partial: '', muted: false })
}
