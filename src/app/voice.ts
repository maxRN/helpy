// Starts and stops P2's voice agent from Helpy's panel (replaces P1's temporary VoicePanel).
// Without ElevenLabs keys the agent cannot start; Helpy then keeps working silently with bubbles.
import { create } from 'zustand'
import { resumeAudio } from '../integration/audioUnlock'
import { startListening, stopListening } from '../integration/listener'
import { installVoiceBridge, resetVoiceClock } from '../integration/voiceBridge'
import { mascot } from '../mascot'
import { session } from '../shared/session'

export type AgentMode = 'capture' | 'debrief' | 'teach'

interface VoiceState {
  mode: AgentMode | null
  error: string
}

export const useVoice = create<VoiceState>()(() => ({ mode: null, error: '' }))

let installed = false
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
  // Capture: Scribe v2 Realtime listens first (transcript + "is the expert talking?"), independent of the agent.
  if (mode === 'capture') {
    await withWatchdog(
      startListening({
        onAnswer: (answer) => voice.noteAnswer(answer),
        onRecordCommand: (cmd) => void setOffRecord(cmd === 'off'),
        onDirectQuestion: (text) => void replyToExpert(text, 'capture'),
      }),
      'Listening',
    ).catch((err) => console.warn('[helpy] Scribe not started', err))
  } else {
    stopListening()
  }
  try {
    if (voice.isActive()) await voice.stop()
    resetVoiceClock()
    await withWatchdog(voice.start(mode), 'The voice agent')
    useVoice.setState({ mode, error: '' })
  } catch (err) {
    console.warn('[helpy] voice agent not started', err)
    await voice.stop().catch(() => undefined) // also closes a session that connects after we gave up
    if (mode === 'capture') {
      // No agent: the same pause detector and question policy still run; Helpy asks with plain TTS.
      voice.startCaptureWithoutAgent((question) => void speak(question))
      useVoice.setState({ mode, error: '' })
    } else {
      useVoice.setState({ mode: null, error: 'Voice is not available right now. Helpy works quietly with speech bubbles.' })
    }
  }
}

/** The expert spoke to Helpy ("hörst du mich?"): a one-sentence answer from Claude, in their language, spoken. */
export async function replyToExpert(text: string, mode: AgentMode) {
  mascot.setState('thinking')
  try {
    const res = await fetch('/api/helpy/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode }),
    })
    const body = (await res.json().catch(() => ({}))) as { reply?: string }
    if (!res.ok || !body.reply) throw new Error('no reply')
    mascot.bubble(body.reply, { ttlMs: 8000 })
    await speak(body.reply)
  } catch {
    mascot.setState('listening')
  }
}

export async function stopVoice() {
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

/** Capture: ask the question Helpy is holding back (its raised hand), now. */
export async function askWaitingQuestion() {
  const voice = await load()
  return voice.isActive() ? voice.askWaitingQuestion() : false
}

// Helpy's own lines outside the agent (e.g. "What do you want to show me?"), via ElevenLabs TTS.
// Without keys the first call fails and Helpy stays with speech bubbles from then on.
let ttsAvailable = true
let playing: HTMLAudioElement | null = null

/** Says `text` out loud; resolves when it was said (or right away without TTS). Helpy shows "speaking" meanwhile, so Scribe does not hear it. */
export async function speak(text: string): Promise<void> {
  if (!ttsAvailable) return
  try {
    const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    if (!res.ok) {
      ttsAvailable = false
      return
    }
    const url = URL.createObjectURL(await res.blob())
    playing?.pause()
    const audio = new Audio(url)
    playing = audio
    mascot.setState('speaking')
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
  }
}
