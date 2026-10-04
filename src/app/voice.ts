// Starts and stops P2's voice agent from Helpy's panel (replaces P1's temporary VoicePanel).
// Without ElevenLabs keys the agent cannot start; Helpy then keeps working silently with bubbles.
import { create } from 'zustand'
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

export async function startVoice(mode: AgentMode) {
  if (!installed) {
    installVoiceBridge()
    installed = true
  }
  try {
    const voice = await load()
    if (voice.isConnected()) await voice.stop()
    resetVoiceClock()
    await voice.start(mode)
    useVoice.setState({ mode, error: '' })
  } catch (err) {
    console.warn('[helpy] voice agent not started', err)
    useVoice.setState({ mode: null, error: 'Voice is not available right now. Helpy works quietly with speech bubbles.' })
  }
}

export async function stopVoice() {
  const voice = await load()
  if (voice.isConnected()) await voice.stop()
  useVoice.setState({ mode: null })
}

/** "Pause (off the record)": goes through the agent when it runs, so it says "Okay, off the record." */
export async function setOffRecord(on: boolean) {
  const voice = await load()
  if (voice.isConnected()) voice.setOffRecord(on, 'ui')
  else session().setOffRecord(on)
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
  return voice.isConnected() ? voice.askWaitingQuestion() : false
}

// Helpy's own lines outside the agent (e.g. "What do you want to show me?"), via ElevenLabs TTS.
// Without keys the first call fails and Helpy stays with speech bubbles from then on.
let ttsAvailable = true
let playing: HTMLAudioElement | null = null

export async function speak(text: string) {
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
    audio.onended = () => {
      URL.revokeObjectURL(url)
      if (playing === audio) mascot.setState('listening')
    }
    await audio.play()
  } catch {
    // Autoplay blocked or no network: the bubble still says it.
  }
}
