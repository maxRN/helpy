// Tracks the user's last input so the voice agent knows when they are busy.
// Typing and pointer activity are kept apart: only typing means "busy, do not interrupt".
// Moving, clicking or scrolling with the mouse never holds Helpy's questions back.
// No bus events per keystroke on purpose: that would flood the log.

let lastTyping = 0
let lastPointer = 0
let installed = false

const onTyping = () => {
  lastTyping = Date.now()
}

const onPointer = () => {
  // Throttled: pointermove fires many times a second.
  const now = Date.now()
  if (now - lastPointer > 200) lastPointer = now
}

/** Call once on the client, e.g. in a useEffect in the app shell. */
export function installActivityTracker() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const opts = { capture: true, passive: true } as const
  window.addEventListener('keydown', onTyping, opts)
  window.addEventListener('input', onTyping, opts)
  window.addEventListener('pointermove', onPointer, opts)
  window.addEventListener('pointerdown', onPointer, opts)
  window.addEventListener('wheel', onPointer, opts)
}

export const activity = {
  /** Last keystroke or text input (epoch ms, 0 = never). The only input that blocks a spoken question. */
  lastTypingAt: () => lastTyping,
  /** Last mouse/pen move, click or scroll (epoch ms, 0 = never). Informational only, never blocks. */
  lastPointerAt: () => lastPointer,
}
