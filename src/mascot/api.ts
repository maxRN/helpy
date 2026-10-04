import { mascot as shared, useMascot, type MascotState } from '../shared/mascot'
import { useHelpyExtras, type BubbleAction, type BubbleInput, type HomeOffset, type Pose } from './store'

let bubbleTimer: ReturnType<typeof setTimeout> | null = null
let poseTimer: ReturnType<typeof setTimeout> | null = null
const HOME_KEY = 'helpy-mascot-home'

export interface BubbleOptions {
  /** Hide the bubble after this many ms. Without it, it stays until replaced. */
  ttlMs?: number
  tone?: 'default' | 'alert'
  actions?: BubbleAction[]
  input?: BubbleInput
}

/**
 * P4's way to drive Helpy. Writes the shared mascot store (src/shared/mascot.ts), which the voice
 * agent writes too, and adds what only the UI needs: bubble buttons, the red alert tone, a timeout.
 */
export const mascot = {
  setState(state: MascotState) {
    shared.setState(state)
  },

  bubble(text: string | null, options: BubbleOptions = {}) {
    if (bubbleTimer) clearTimeout(bubbleTimer)
    bubbleTimer = null
    shared.bubble(text)
    useHelpyExtras.setState({ bubbleExtras: text ? { text, tone: options.tone ?? 'default', actions: options.actions ?? [], input: options.input ?? null } : null })
    if (text && options.ttlMs) {
      bubbleTimer = setTimeout(() => {
        if (useMascot.getState().bubble === text) shared.bubble(null)
      }, options.ttlMs)
    }
  },

  /** A gesture on top of the state; with `ms` it ends by itself. */
  pose(pose: Pose | null, ms?: number) {
    if (poseTimer) clearTimeout(poseTimer)
    poseTimer = null
    useHelpyExtras.setState({ pose })
    if (pose && ms) poseTimer = setTimeout(() => useHelpyExtras.setState({ pose: null }), ms)
  },

  /** Fly next to a registered element (see useTarget); null sends Helpy back to its corner. */
  pointTo(targetId: string | null, tone: 'default' | 'alert' = 'default') {
    useHelpyExtras.setState({ tone: targetId ? tone : 'default' })
    shared.pointTo(targetId)
  },

  /** Guardrail moment: red eyes, point at the field, say why. */
  alert(targetId: string | null, text: string, actions: BubbleAction[] = []) {
    shared.setState('alert')
    mascot.pointTo(targetId, 'alert')
    mascot.bubble(text, { tone: 'alert', actions })
  },

  reset() {
    mascot.bubble(null)
    mascot.pose(null)
    mascot.pointTo(null)
    shared.setState('idle')
  },

  setHome(home: HomeOffset) {
    useHelpyExtras.setState({ home })
    try {
      localStorage.setItem(HOME_KEY, JSON.stringify(home))
    } catch {
      // Storage can be unavailable; the position just is not remembered.
    }
  },

  restoreHome() {
    try {
      const home = JSON.parse(localStorage.getItem(HOME_KEY) ?? 'null') as Partial<HomeOffset> | null
      if (typeof home?.right === 'number' && typeof home.bottom === 'number') useHelpyExtras.setState({ home: { right: home.right, bottom: home.bottom } })
    } catch {
      // Ignore broken or blocked storage.
    }
  },
}
