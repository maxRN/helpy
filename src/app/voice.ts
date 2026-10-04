// Starts and stops P2's voice agent from Helpy's panel (replaces P1's temporary VoicePanel).
// Without ElevenLabs keys the agent cannot start; Helpy then keeps working silently with bubbles.
import { create } from 'zustand'
import { toLogLines } from '../debrief/sessionLog'
import { resumeAudio } from '../integration/audioUnlock'
import { emitEvent, getEventLog } from '../shared/bus'
import { ungroundedInvoiceRefs } from '../shared/grounding'
import { screenSummary } from '../shared/screen'
import { logAnswer, logHeard, speech, startListening, stopListening } from '../integration/listener'
import { looksLikeQuestionBack, type TurnVerdict, type Utterance } from '../integration/speech'
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
  // The follow-up questions after a task use the same ears and voice as the task itself (see askAloud).
  if (mode === 'debrief') {
    if (voice.isActive()) await voice.stop()
    resetVoiceClock()
    heard = []
    try {
      await withWatchdog(startListening({ onRawTurn: (u) => void heard.push(u), onRecordCommand: (cmd) => cmd === 'off' && void debriefOffRecord() }), 'Listening')
      useVoice.setState({ mode, error: '' })
    } catch (err) {
      console.warn('[helpy] Scribe not started for the debrief', err)
      stopListening()
      useVoice.setState({ mode: null, error: 'Voice is not available right now. Helpy works quietly with speech bubbles.' })
    }
    return
  }
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

// ---------------------------------------------------------------- debrief
// The follow-up questions after a task run like the task itself: Scribe listens (so "Helpy hears" shows what it
// heard), Helpy's TTS speaks (same voice, model and audio quality as during the task, in the language the expert
// spoke) and Claude decides what each reply is. The ElevenLabs agent did this before: it streamed 16 kHz audio,
// which sounded worse, and said the English questions it was given.

/**
 * A reply ends this long after Scribe closed its last sentence with no new one started: with Scribe's own 0.8 s
 * that is about 1.5 s of silence, so a breath between two sentences does not cut an answer in half.
 */
const REPLY_END_MS = 700
const REPLY_WAIT_MS = 120_000

/** Finished turns heard in the debrief that no question took yet. */
let heard: Utterance[] = []

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** True while the debrief can talk and listen (Scribe runs). */
export const debriefListening = () => useVoice.getState().mode === 'debrief' && speech.active()

/**
 * "Off the record" said in the debrief: Helpy stops listening at once (Scribe is muted, no audio leaves the
 * computer), so coming back is a click on "Continue", like in a lesson.
 */
async function debriefOffRecord() {
  await setOffRecord(true)
  const de = session().language === 'de'
  mascot.bubble(de ? 'Inoffiziell: Ich höre nicht zu. Klick auf Weiter, wenn du so weit bist.' : 'Off the record: I’m not listening. Click Continue when you’re ready.', {
    topic: 'prompt',
    actions: [{ label: de ? 'Weiter' : 'Continue', primary: true, onClick: () => void setOffRecord(false) }],
  })
  void speak(de ? 'Okay, inoffiziell.' : 'Okay, off the record.')
}

/** The expert's next reply: their sentences until REPLY_END_MS of quiet, joined. null when none came or cancelled. */
async function nextReply(cancelled: () => boolean): Promise<Utterance | null> {
  let end = Date.now() + REPLY_WAIT_MS
  while (!heard.length) {
    if (cancelled() || Date.now() > end || !debriefListening()) return null
    if (session().offRecord) end = Date.now() + REPLY_WAIT_MS // paused: the question waits as long as it takes
    await sleep(150)
  }
  // The same reply goes on while they keep talking (a breath between sentences is not the end).
  while ((speech.isSpeaking() || Date.now() - speech.lastSpeechAt() < REPLY_END_MS) && !cancelled()) await sleep(150)
  const parts = heard.splice(0)
  return { text: parts.map((p) => p.text).join(' '), startedAt: parts[0].startedAt, endedAt: parts[parts.length - 1].endedAt }
}

/** Says a line in the debrief; the bubble shows `bubble` (default: the line) from the moment the voice starts. */
async function sayLine(text: string, o: { bubble?: string; onStart?: () => void } = {}) {
  await speak(text, {
    onStart: () => {
      mascot.bubble(o.bubble ?? text, { topic: 'question' })
      o.onStart?.()
    },
  })
  if (useMascot.getState().state !== 'speaking') mascot.setState('listening')
}

/** Never name an invoice that does not exist (grounding); ask which one instead. */
function grounded(text: string) {
  if (!ungroundedInvoiceRefs(text).length) return text
  return session().language === 'de' ? 'Welche Rechnung meinst du genau?' : 'Which invoice do you mean exactly?'
}

type Wrap = <T>(p: Promise<T>) => Promise<T | null>

/** The verdict for an obvious question back when Claude could not decide: say the question again. */
const questionBack = (question: string): TurnVerdict => ({ toHelpy: true, intent: 'clarify', reply: question, language: 'keep' })

/**
 * Debrief: Helpy asks out loud until the question is really answered. A question back ("Wie meinst du das?") is
 * explained and the same question stays open; only a real answer is logged as the answer, a skip moves on.
 * `wrap` / `stopped` make the waits interruptible (skip, stop).
 */
export async function askAloud(question: string, opts: { wrap?: Wrap; stopped?: () => boolean } = {}): Promise<ReplyOutcome | null> {
  if (!debriefListening()) return null
  const cancelled = () => !!opts.stopped?.()
  const wrap: Wrap = opts.wrap ?? (<T,>(p: Promise<T>) => p.catch(() => null))
  let questionId = ''
  let last: Utterance | null = null
  const take = (u: Utterance | null) => {
    last = u
    return u?.text.trim() || null
  }
  return askUntilAnswered({
    ask: async () => {
      await sayLine(question, {
        onStart: () => {
          heard = [] // what was said before the question is not its answer
          questionId = emitEvent({ source: 'voice', kind: 'question_asked', speaker: 'agent', text: question, meta: { phase: 'debrief' } }).id
        },
      })
      return take(await wrap(nextReply(cancelled)))
    },
    listen: async () => take(await wrap(nextReply(cancelled))),
    classify: async (reply) => {
      // Without Claude an obvious question back still gets the question again, never counts as the answer.
      const verdict = (await classifyTurn(reply, 'debrief', question)) ?? (looksLikeQuestionBack(reply) ? questionBack(question) : null)
      // Logged once it is clear what it was: the answer as the answer, a question back as said to Helpy.
      const answer = !verdict || verdict.intent === 'answer'
      if (last) {
        logHeard(last, !answer)
        if (answer) logAnswer(last, questionId)
      }
      return verdict
    },
    explain: (text) => sayLine(grounded(text)),
    stopped: opts.stopped,
  })
}

/** Says a line of the debrief (e.g. why it ends) with the same voice. */
export async function sayAloud(text: string) {
  await sayLine(text)
}

const AGREES = /^\s*(ja|jap|jo|genau|richtig|stimmt|korrekt|passt|yes|yeah|yep|exactly|correct|right|that's it)\b/i

/**
 * Debrief: Helpy explains the process back and asks "Is that how it works?". Resolves with the expert's verdict:
 * confirmed, or their correction in their own words. A question back is explained first, like any question.
 */
export async function teachBackAloud(text: string, opts: { wrap?: Wrap; stopped?: () => boolean } = {}): Promise<{ confirmed: boolean; correction?: string } | null> {
  if (!debriefListening()) return null
  const de = session().language === 'de'
  const ask = de ? 'Stimmt das so?' : 'Is that how it works?'
  const bubble = de ? `So habe ich es verstanden. ${ask} Sag mir, wenn etwas nicht stimmt.` : `Here’s how I understood it. ${ask} Tell me if something is wrong.`
  const cancelled = () => !!opts.stopped?.()
  const wrap: Wrap = opts.wrap ?? (<T,>(p: Promise<T>) => p.catch(() => null))
  const question = `${ask} (Helpy just explained the process back: "${text.slice(0, 1500)}")`
  let verdict: TurnVerdict | null = null
  let last: Utterance | null = null
  const take = (u: Utterance | null) => {
    last = u
    return u?.text.trim() || null
  }
  const outcome = await askUntilAnswered({
    ask: async () => {
      await sayLine(`${text} ${ask}`, {
        bubble,
        onStart: () => {
          heard = []
          emitEvent({ source: 'voice', kind: 'teachback_given', speaker: 'agent', text })
        },
      })
      return take(await wrap(nextReply(cancelled)))
    },
    listen: async () => take(await wrap(nextReply(cancelled))),
    classify: async (reply) => {
      verdict = (await classifyTurn(reply, 'debrief', question)) ?? (looksLikeQuestionBack(reply) ? questionBack(`${text} ${ask}`) : null)
      if (last) logHeard(last, !!verdict && verdict.intent !== 'answer')
      return verdict
    },
    explain: (line) => sayLine(grounded(line)),
    stopped: opts.stopped,
  })
  if (cancelled()) return null
  const result =
    outcome.kind === 'answered'
      ? (verdict as TurnVerdict | null)?.confirmed ?? AGREES.test(outcome.answer)
        ? { confirmed: true }
        : { confirmed: false, correction: outcome.answer }
      : { confirmed: false, correction: '(no response)' }
  emitEvent({ source: 'voice', kind: 'teachback_result', speaker: 'expert', text: result.correction, meta: { confirmed: result.confirmed } })
  return result
}

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
