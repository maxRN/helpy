// What is on the user's screen right now, for every mode (Capture, debrief, Teach).
// Two sources, each with its own timestamp:
// - app: the visible app's own state (ProcureFlow registers a describer). Exact and always current.
// - vision: the latest screenshot description from /api/frame (Capture only, the shared screen).
// A description of an older frame never replaces a newer one, and once a newer, different frame has
// been seen, the old description is marked outdated until the new one arrives.

export interface VisionScreen {
  text: string
  /** Epoch ms when the described frame was captured. */
  at: number
  /** A newer frame looks different and is being described: this text may no longer be true. */
  outdated: boolean
}

let vision: VisionScreen | null = null
let lastChangeAt = 0
let appDescriber: (() => string | null) | null = null

/** The visible app's own description of its screen (null = it is not on screen). */
export function registerAppScreen(describe: (() => string | null) | null) {
  appDescriber = describe
}

/** A frame that differs from the previous one was captured at `at`. */
export function markScreenChanged(at: number) {
  lastChangeAt = Math.max(lastChangeAt, at)
  if (vision && at > vision.at) vision = { ...vision, outdated: true }
}

/** The vision model described the frame captured at `at`. Older descriptions than the current one are ignored. */
export function noteVisionScreen(text: string, at: number) {
  if (!text.trim() || (vision && at < vision.at)) return
  vision = { text: text.trim(), at, outdated: lastChangeAt > at }
}

export function resetScreen() {
  vision = null
  lastChangeAt = 0
}

export const visionScreen = (): VisionScreen | null => vision

export function appScreen(): string | null {
  try {
    return appDescriber?.() ?? null
  } catch {
    return null
  }
}

/**
 * One block of text for a model prompt: what is visible now, each part with its age, and an explicit
 * note when nothing reliable is known, so the model asks instead of guessing.
 * `ages: false` leaves the ages out, so an unchanged screen always gives the same text.
 */
export function screenSummary({ now = Date.now(), ages = true }: { now?: number; ages?: boolean } = {}): string {
  const parts: string[] = []
  const app = appScreen()
  if (app) parts.push(`App state (live, exact): ${app}`)
  if (vision) {
    const notes = [
      ...(ages ? [`${Math.max(0, Math.round((now - vision.at) / 1000))} s ago`] : []),
      ...(vision.outdated ? ['the screen has changed since, being updated'] : []),
    ]
    parts.push(`Last screenshot${notes.length ? ` (${notes.join(', ')})` : ''}: ${vision.text}`)
  }
  return parts.length ? parts.join('\n') : 'Unknown: nothing on screen has been read yet. Do not assume any values.'
}
