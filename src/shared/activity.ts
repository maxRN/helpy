// Tracks the user's last input so the voice agent knows when they are busy.
// Typing and pointer activity are kept apart: only typing means "busy, do not interrupt".
// Moving, clicking or scrolling with the mouse never holds Helpy's questions back.
// No bus events per keystroke on purpose: that would flood the log.

let lastTyping = 0
let lastPointer = 0
let lastField = 0
let installed = false

// Form controls of the work app. A click or focus there means "in the middle of a step".
const FIELD = 'input, select, textarea, button, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="option"]'

const onField = (e: Event) => {
  const target = e.target instanceof Element ? e.target : null
  if (!target || target.closest('[data-helpy]')) return // Helpy's own bubble buttons do not count
  if (target.closest(FIELD)) lastField = Date.now()
}

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
  window.addEventListener('pointerdown', onField, opts)
  window.addEventListener('focusin', onField, opts)
}

export const activity = {
  /** Last keystroke or text input (epoch ms, 0 = never). The only input that blocks a spoken question. */
  lastTypingAt: () => lastTyping,
  /** Last mouse/pen move, click or scroll (epoch ms, 0 = never). Informational only, never blocks. */
  lastPointerAt: () => lastPointer,
  /** Last click or focus in a form control (epoch ms, 0 = never): holds questions for a few seconds. */
  lastFieldAt: () => lastField,
}
