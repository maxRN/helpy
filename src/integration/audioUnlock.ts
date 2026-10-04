// Chrome may create an AudioContext in the "suspended" state (autoplay rules). The ElevenLabs SDK then
// waits on `await context.resume()` (agent output, Scribe microphone) until the page gets a user gesture,
// and Helpy hangs at "turning on my ears". This tracks every AudioContext the page creates and resumes
// the suspended ones on the next click or key press anywhere on the page.

const contexts = new Set<AudioContext>()
let installed = false

export function installAudioUnlock() {
  if (installed || typeof window === 'undefined' || !window.AudioContext) return
  installed = true

  const Native = window.AudioContext
  class TrackedAudioContext extends Native {
    constructor(options?: AudioContextOptions) {
      super(options)
      contexts.add(this)
      this.addEventListener('statechange', () => {
        if (this.state === 'closed') contexts.delete(this)
      })
    }
  }
  window.AudioContext = TrackedAudioContext

  const unlock = () => resumeAudio()
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
    window.addEventListener(type, unlock, { capture: true, passive: true })
  }
}

/** Resumes every suspended AudioContext. Works when called during a user gesture. */
export function resumeAudio() {
  for (const ctx of contexts) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  }
}

/** True while some audio (agent voice, Scribe microphone) waits for a user gesture. */
export const audioSuspended = () => [...contexts].some((c) => c.state === 'suspended')
