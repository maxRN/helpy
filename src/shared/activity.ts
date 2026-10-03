// Tracks the last keyboard/mouse input so the voice agent knows when the user is busy.
// No bus events per keystroke on purpose: that would flood the log.

let last = 0
let installed = false
let lastMove = 0

const touch = () => {
  last = Date.now()
}

const onMove = () => {
  // Small mouse movements while reading count as activity, but throttle the work.
  const now = Date.now()
  if (now - lastMove > 200) {
    lastMove = now
    last = now
  }
}

/** Call once on the client, e.g. in a useEffect in the app shell. */
export function installActivityTracker() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const opts = { capture: true, passive: true } as const
  window.addEventListener('keydown', touch, opts)
  window.addEventListener('input', touch, opts)
  window.addEventListener('mousedown', touch, opts)
  window.addEventListener('wheel', touch, opts)
  window.addEventListener('pointermove', onMove, opts)
  touch()
}

export const activity = {
  lastInputAt: () => last,
}
