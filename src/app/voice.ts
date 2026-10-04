// Starts and stops P2's voice agent from Helpy's panel (replaces P1's temporary VoicePanel).
// Without ElevenLabs keys the agent cannot start; Helpy then keeps working silently with bubbles.
import { create } from 'zustand'
import { toLogLines } from '../debrief/sessionLog'
import { resumeAudio } from '../integration/audioUnlock'
import { getEventLog } from '../shared/bus'
import { ungroundedInvoiceRefs } from '../shared/grounding'
import { screenSummary } from '../shared/screen'
import { speech, startListening, stopListening } from '../integration/listener'
import type { Quote } from '../agent/types'
import type { TurnVerdict } from '../integration/speech'
import { installVoiceBridge, resetVoiceClock } from '../integration/voiceBridge'
import { mascot, type BubbleAction } from '../mascot'
import { useMascot } from '../shared/mascot'
import { session } from '../shared/session'
import { askUntilAnswered, type ReplyOutcome } from './replyLoop'

export type AgentMode = 'capture' | 'debrief' | 'teach'

interface VoiceState {
  mode: AgentMode | null
  error: string
}

export const useVoice = create<VoiceState>()(() => ({ mode: null, error: '' }))

let installed = false
let stopPrefetch: (() => void) | null = null
const load = () => import('../agent/voice')

const NUDGE_AFTER_MS = 4_000
const GIVE_UP_AFTER_MS = 20_000

/**
 * Never let a hanging start freeze Helpy. After 4 s Helpy asks for a click (Chrome may hold audio until a
 * user gesture, see audioUnlock.ts); after 20 s it gives up so the caller can fall back.
 */
async function withWatchdog<T>(work: Promise<T>, what: string): Promise<T> {
  let nudged = false
  let giveUp: ReturnType<typeof setTimeout> | undefined
  const nudge = setTimeout(() => {
    nudged = true
    mascot.setState('idle')
    mascot.bubble('Click me once so I can turn on my ears and my voice.', {
      actions: [{ label: 'Turn on sound', primary: true, onClick: resumeAudio }],
    })
  }, NUDGE_AFTER_MS)
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        giveUp = setTimeout(() => reject(new Error(`${what} did not start within ${GIVE_UP_AFTER_MS / 1000} s`)), GIVE_UP_AFTER_MS)
      }),
    ])
  } finally {
    clearTimeout(nudge)
    clearTimeout(giveUp)
    if (nudged) mascot.bubble(null)
  }
}

export async function startVoice(mode: AgentMode) {
  if (!installed) {
    installVoiceBridge()
    installed = true
  }
  const voice = await load()
  // Capture runs on ElevenLabs Scribe (listening, pauses) + ElevenLabs TTS (speaking), with Claude choosing
  // the words. The agent is not used here: its mic would hear the narration, it only speaks English, and it
  // rephrases what it is told. It is still used for the debrief and the tutor, where it holds a real dialog.
  if (mode === 'capture') {
    if (voice.isActive()) await voice.stop()
    resetVoiceClock()
    await withWatchdog(
      startListening({
        onAnswer: (answer) => voice.noteAnswer(answer),
        onRecordCommand: (cmd) => void setOffRecord(cmd === 'off'),
        onTurn: (text, question) => replyToTurn(text, 'capture', question),
        onQuestionSkipped: () => voice.noteSkipped(),
      }),
      'Listening',
    ).catch((err) => console.warn('[helpy] Scribe not started', err))
    // A live question is only said if it is still a pause once its audio is ready; otherwise it waits.
    if (!stopPrefetch) {
      // A held question (raised hand): fetch its audio now, so it is said without delay at the pause.
      stopPrefetch = useMascot.subscribe((s, prev) => {
        // Only in Capture: there Helpy's own TTS says the question (the debrief's agent speaks for itself).
        if (s.waiting && s.waiting.text !== prev.waiting?.text && useVoice.getState().mode === 'capture') prefetchSpeech(s.waiting.text)
      })
    }
    voice.startCaptureWithoutAgent(async (question, control) => {
      const said = await speak(question, { gate: control.stillQuiet, onStart: (audio) => control.started({ voice: audio }) })
      return said === 'spoken'
    })
    useVoice.setState({ mode, error: '' })
    return
  }
  stopListening()
  try {
    if (voice.isActive()) await voice.stop()
    resetVoiceClock()
    await withWatchdog(voice.start(mode), 'The voice agent')
    useVoice.setState({ mode, error: '' })
  } catch (err) {
    console.warn('[helpy] voice agent not started', err)
    await voice.stop().catch(() => undefined) // also closes a session that connects after we gave up
    useVoice.setState({ mode: null, error: 'Voice is not available right now. Helpy works quietly with speech bubbles.' })
  }
}

/** Claude's verdict on a turn (see /api/helpy/turn); null when it could not decide. Says nothing. */
export async function classifyTurn(text: string, mode: AgentMode, question?: string): Promise<TurnVerdict | null> {
  const recent = toLogLines(getEventLog()).slice(-12)
  const res = await fetch('/api/helpy/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, recent, language: session().language, mode, screen: screenSummary(), question }),
  }).catch(() => null)
  if (!res?.ok) return null
  const turn = (await res.json().catch(() => null)) as TurnVerdict | null
  if (!turn) return null
  if (turn.language !== 'keep') session().setLanguage(turn.language)
  return turn
}

/**
 * A turn that might be meant for Helpy ("hörst du mich?", "sprich Deutsch"), or any turn while Helpy waits for
 * the answer to `question`: Claude decides with the recent session as context. If it was for Helpy (e.g. "Wie
 * meinst du das?"), Helpy answers out loud, in the language it was spoken to in, which it keeps from then on.
 * Resolves with the verdict once Helpy starts answering (null when Claude could not decide).
 */
export async function replyToTurn(text: string, mode: AgentMode, question?: string): Promise<TurnVerdict | null> {
  const turn = await classifyTurn(text, mode, question)
  if (!turn?.toHelpy || !turn.reply) return turn
  // Grounding: never name an invoice that does not exist; ask instead.
  const unknown = ungroundedInvoiceRefs(turn.reply)
  if (unknown.length) console.warn('[helpy] reply named an invoice that does not exist:', unknown.join(', '))
  const reply = unknown.length ? (session().language === 'de' ? 'Welche Rechnung meinst du genau?' : 'Which invoice do you mean exactly?') : turn.reply
  // The bubble shows the reply when Helpy starts saying it. Resolve then, so no live question slips in between
  // (see speech.replyPending).
  await new Promise<void>((resolve) =>
    void speak(reply, {
      onStart: () => {
        mascot.bubble(reply)
        resolve()
      },
    }).finally(resolve),
  )
  return turn
}

export async function stopVoice() {
  stopPrefetch?.()
  stopPrefetch = null
  stopListening()
  const voice = await load()
  if (voice.isActive()) await voice.stop()
  useVoice.setState({ mode: null })
}

/** "Pause (off the record)": goes through the agent when it runs, so it says "Okay, off the record." */
export async function setOffRecord(on: boolean) {
  const voice = await load()
  if (voice.isConnected()) voice.setOffRecord(on, 'ui')
  else if (voice.isActive()) {
    // Capture without an agent: the question policy must pause too, and Helpy confirms with TTS.
    voice.setOffRecord(on, 'ui')
    // Off the record Helpy's ears are off (no audio leaves the computer), so coming back is a click.
    if (on) mascot.bubble('Off the record: I’m not looking or listening. Click me and choose “Continue recording” when you’re ready.', { topic: 'notice' })
    void speak(on ? 'Okay, off the record. Click me when you want to continue.' : 'Back on the record.')
  } else session().setOffRecord(on)
}

/** How long Helpy waits for the agent to explain its question by itself before it sends the explanation. */
const AGENT_EXPLAINS_WITHIN_MS = 1500

/**
 * Debrief: the agent asks out loud until the question is really answered. A question back ("Wie meinst du
 * das?") is explained (by the agent itself, which heard it, or with Claude's explanation) and the same question
 * stays open; only a real answer is logged as the answer. `wrap` makes waits interruptible (skip, stop).
 */
export async function askAloud(
  question: string,
  opts: { wrap?: <T>(p: Promise<T>) => Promise<T | null>; stopped?: () => boolean } = {},
): Promise<ReplyOutcome | null> {
  const voice = await load()
  if (!voice.isConnected()) return null
  const wrap = opts.wrap ?? (<T,>(p: Promise<T>) => p.catch(() => null))
  let last: Quote | null = null
  let repliedAt = 0
  const take = (q: Quote | null) => {
    last = q
    repliedAt = Date.now()
    return q?.text?.trim() || null
  }
  const outcome = await askUntilAnswered({
    ask: async () => take(await wrap(voice.ask(question, { emitAnswer: false }))),
    listen: async () => take(await wrap(voice.listenAgain({ emitAnswer: false }))),
    classify: (reply) => classifyTurn(reply, 'debrief', question),
    explain: async (text) => {
      // The agent heard the question back too and usually explains on its own (its prompt says so). If it
      // does not, it says Claude's explanation; either way Helpy listens again once it is done.
      const since = repliedAt - TURN_FLUSH_MS
      const end = Date.now() + AGENT_EXPLAINS_WITHIN_MS
      while (!voice.agentSpokeSince(since) && Date.now() < end) await new Promise((r) => setTimeout(r, 150))
      if (!voice.agentSpokeSince(since)) {
        mascot.bubble(text)
        await wrap(voice.say(text))
      }
      await wrap(voice.agentQuiet())
    },
    stopped: opts.stopped,
  })
  if (outcome.kind === 'answered' && last) voice.recordAnswer(last)
  return outcome
}

/** The transcript ends a reply after this much silence (src/agent/transcript.ts): the agent may start meanwhile. */
const TURN_FLUSH_MS = 1500

let tutorMuted = 0

export interface SayStepOptions {
  /** What Helpy flies to while it says the line (null: back to its corner). */
  target?: string | null
  tone?: 'default' | 'alert'
  actions?: BubbleAction[]
  /** False once a newer line replaced this one: it is then not said at all. */
  current?: () => boolean
  /** Context for the tutor agent instead of the default "[GUIDE] Helpy told the trainee: …". */
  context?: string
}

/**
 * Teach: Helpy says a line of its own (a step, the guardrail stop, praise) with its TTS voice. The bubble, the
 * pointing and the voice start together, with the same words. The tutor agent never talks over it, does not hear
 * it through the microphone, and gets it as context so it can answer "Wie meinst du das?" about it.
 */
export async function sayStep(text: string, o: SayStepOptions = {}): Promise<void> {
  const voice = await load()
  const current = o.current ?? (() => true)
  const agent = voice.isConnected()
  if (agent && voice.isAgentSpeaking()) await voice.agentQuiet(10_000) // the tutor finishes its sentence first
  if (!current()) return
  if (agent && tutorMuted++ === 0) voice.muteMic(true)
  try {
    await speak(text, {
      gate: current,
      onStart: () => {
        if (o.tone === 'alert') return mascot.alert(o.target ?? null, text, o.actions)
        mascot.pointTo(o.target ?? null)
        mascot.bubble(text, { topic: 'step', actions: o.actions })
      },
    })
  } finally {
    if (agent) {
      if (--tutorMuted === 0) voice.muteMic(false)
      voice.tellAgent(o.context ?? `[GUIDE] Helpy just told the trainee: "${text}"`)
    }
  }
}

export async function teachBackAloud(text: string): Promise<{ confirmed: boolean; correction?: string } | null> {
  const voice = await load()
  return voice.isConnected() ? voice.teachBack(text) : null
}

/**
 * Capture is ending: Helpy asks the live questions it still owes (at least three, one about a guardrail),
 * about decisions it saw but nobody explained, each at a pause. No-op without a live voice session.
 */
export async function wrapUpLiveQuestions(cancelled: () => boolean) {
  const voice = await load()
  // Without ears (Scribe) Helpy could ask but never hear the answer: no wrap-up then.
  if (!voice.isActive() || !speech.active()) return null
  const lang = session().language
  return voice.wrapUpCapture({
    cancelled,
    onStart: (owed) => {
      const line =
        lang === 'de'
          ? owed === 1 ? 'Bevor du aufhörst: noch eine kurze Frage zu dem, was ich gesehen habe.' : `Bevor du aufhörst: noch ${owed} kurze Fragen zu dem, was ich gesehen habe.`
          : owed === 1 ? 'Before you stop: one quick question about what I saw.' : `Before you stop: ${owed} quick questions about what I saw.`
      mascot.setState('speaking')
      mascot.bubble(line)
      void speak(line)
    },
  })
}

/** Capture: ask the question Helpy is holding back (its raised hand), now. */
export async function askWaitingQuestion() {
  const voice = await load()
  return voice.isActive() ? voice.askWaitingQuestion() : false
}

// Helpy's own lines outside the agent (e.g. "What do you want to show me?"), via ElevenLabs TTS.
// Without keys the first call fails and Helpy stays with speech bubbles from then on.
let ttsAvailable = true
let playing: HTMLAudioElement | null = null

// Audio for the last few lines, by text. A question Helpy holds back is fetched while it waits, so at
// the pause it plays at once instead of after another TTS round trip.
const TTS_CACHE_MAX = 4
const ttsCache = new Map<string, Promise<Blob | null>>()

/** The spoken audio for `text` (null when TTS failed); fetched once, shared by prefetch and speak. */
export function ttsAudio(text: string): Promise<Blob | null> {
  const hit = ttsCache.get(text)
  if (hit) return hit
  const audio = fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    .then((res) => {
      if (!res.ok) ttsAvailable = false
      return res.ok ? res.blob() : null
    })
    .catch(() => null)
  ttsCache.set(text, audio)
  if (ttsCache.size > TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value!)
  void audio.then((blob) => {
    if (!blob && ttsCache.get(text) === audio) ttsCache.delete(text) // never keep a failure
  })
  return audio
}

/** Fetches the audio for a line Helpy is about to say (e.g. a held question). */
export function prefetchSpeech(text: string) {
  if (ttsAvailable) void ttsAudio(text)
}

export interface SpeakOptions {
  /** Checked once the audio is ready, right before it plays: false = do not say it now. */
  gate?: () => boolean
  /** Called after playback starts (`audio` true), or when the line can only be shown (no audio). */
  onStart?: (audio: boolean) => void
}

/**
 * Says `text` out loud; resolves 'spoken' when it was said (or right away without TTS), 'skipped' when
 * the gate said no. Helpy shows "speaking" meanwhile, so Scribe does not hear it.
 */
export async function speak(text: string, { gate, onStart }: SpeakOptions = {}): Promise<'spoken' | 'skipped'> {
  let audio: HTMLAudioElement | null = null
  let url: string | null = null
  let started = false

  const releasePlayback = () => {
    if (audio && playing === audio) {
      playing = null
      audio.onended = audio.onerror = audio.onpause = null
      audio.pause()
    }
    if (!playing && useMascot.getState().state === 'speaking') mascot.setState('listening')
  }
  const showWithoutAudio = (): 'spoken' | 'skipped' => {
    // Clear our own speaking state before checking the gate, so it cannot block the bubble fallback.
    releasePlayback()
    if (gate && !gate()) return 'skipped'
    onStart?.(false)
    if (!playing && useMascot.getState().state === 'speaking') mascot.setState('listening')
    return 'spoken'
  }
  if (!ttsAvailable) return showWithoutAudio()

  try {
    const blob = await ttsAudio(text)
    if (!blob) return showWithoutAudio()
    // The expert may have started talking or typing while the audio was generated.
    if (gate && !gate()) return 'skipped'
    url = URL.createObjectURL(blob)
    playing?.pause()
    const playback = new Audio(url)
    audio = playback
    playing = audio
    mascot.setState('speaking')
    await new Promise<void>((resolve, reject) => {
      playback.onended = () => resolve()
      playback.onerror = () => reject(new Error('Audio playback failed'))
      playback.onpause = () => resolve() // replaced by the next line Helpy says
      void playback.play().then(() => {
        if (playing !== playback || playback.paused) return resolve()
        started = true
        onStart?.(true)
      }).catch(reject)
    })
    return started ? 'spoken' : showWithoutAudio()
  } catch {
    // Autoplay blocked or no network: the bubble still says it, without counting it as audible.
    return started ? 'spoken' : showWithoutAudio()
  } finally {
    releasePlayback()
    if (url) URL.revokeObjectURL(url)
  }
}
