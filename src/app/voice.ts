// Starts and stops P2's voice agent from Helpy's panel (replaces P1's temporary VoicePanel).
// Without ElevenLabs keys the agent cannot start; Helpy then keeps working silently with bubbles.
import { create } from 'zustand'
import { toLogLines } from '../debrief/sessionLog'
import { resumeAudio } from '../integration/audioUnlock'
import { getEventLog } from '../shared/bus'
import { ungroundedInvoiceRefs } from '../shared/grounding'
import { screenSummary } from '../shared/screen'
import { speech, startListening, stopListening } from '../integration/listener'
import { installVoiceBridge, resetVoiceClock } from '../integration/voiceBridge'
import { mascot } from '../mascot'
import { useMascot } from '../shared/mascot'
import { session } from '../shared/session'

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
        onMaybeToHelpy: (text) => answerIfForHelpy(text, 'capture'),
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
      const said = await speak(question, { gate: control.stillQuiet, onStart: control.started })
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

/**
 * A turn that might be meant for Helpy ("hörst du mich?", "hast du das verstanden?", "sprich Deutsch"):
 * Claude decides with the recent session as context. If it was for Helpy, Helpy answers out loud (in the
 * requested language, which it keeps from then on) and this resolves true.
 */
export async function answerIfForHelpy(text: string, mode: AgentMode): Promise<boolean> {
  const recent = toLogLines(getEventLog()).slice(-12)
  const res = await fetch('/api/helpy/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, recent, language: session().language, mode, screen: screenSummary() }),
  })
  if (!res.ok) return false
  const turn = (await res.json()) as { toHelpy: boolean; reply: string; language: 'de' | 'en' | 'keep' }
  if (turn.language !== 'keep') session().setLanguage(turn.language)
  if (!turn.toHelpy || !turn.reply) return false
  // Grounding: never name an invoice that does not exist; ask instead.
  const unknown = ungroundedInvoiceRefs(turn.reply)
  if (unknown.length) console.warn('[helpy] reply named an invoice that does not exist:', unknown.join(', '))
  const reply = unknown.length ? (session().language === 'de' ? 'Welche Rechnung meinst du genau?' : 'Which invoice do you mean exactly?') : turn.reply
  mascot.bubble(reply)
  // Resolve once Helpy starts answering, so no live question slips in between (see speech.replyPending).
  await new Promise<void>((resolve) => void speak(reply, { onStart: resolve }).finally(resolve))
  return true
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
    void speak(on ? 'Okay, off the record.' : 'Back on the record.')
  } else session().setOffRecord(on)
}

/** Debrief: the agent asks out loud and returns the spoken answer; null when no agent runs. */
export async function askAloud(question: string): Promise<string | null> {
  const voice = await load()
  if (!voice.isConnected()) return null
  try {
    return (await voice.ask(question)).text
  } catch {
    return null
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
  /** Called right before the voice starts (or right away when there is no TTS). */
  onStart?: () => void
}

/**
 * Says `text` out loud; resolves 'spoken' when it was said (or right away without TTS), 'skipped' when
 * the gate said no. Helpy shows "speaking" meanwhile, so Scribe does not hear it.
 */
export async function speak(text: string, { gate, onStart }: SpeakOptions = {}): Promise<'spoken' | 'skipped'> {
  if (!ttsAvailable) {
    if (gate && !gate()) return 'skipped'
    onStart?.()
    return 'spoken'
  }
  try {
    const blob = await ttsAudio(text)
    if (!blob) {
      if (!ttsAvailable) return speak(text, { gate, onStart }) // no TTS (no keys): the bubble says it
      throw new Error('TTS request failed')
    }
    // The expert may have started talking or typing while the audio was generated.
    if (gate && !gate()) return 'skipped'
    const url = URL.createObjectURL(blob)
    playing?.pause()
    const audio = new Audio(url)
    playing = audio
    mascot.setState('speaking')
    onStart?.()
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve()
      audio.onerror = () => resolve()
      audio.onpause = () => resolve() // replaced by the next line Helpy says
      audio.play().catch(() => resolve())
    })
    URL.revokeObjectURL(url)
    if (playing === audio) {
      playing = null
      mascot.setState('listening')
    }
  } catch {
    // Autoplay blocked or no network: the bubble still says it.
    if (gate && !gate()) return 'skipped'
    onStart?.()
  }
  return 'spoken'
}
