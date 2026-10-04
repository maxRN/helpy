import { mascot as shared, useMascot, type MascotState } from '../shared/mascot'
import { useHelpyExtras, type BubbleAction, type BubbleInput, type BubbleTopic, type Pose } from './store'

let poseTimer: ReturnType<typeof setTimeout> | null = null
/** Where older versions remembered a dragged resting spot; Helpy now always rests bottom-right. */
const LEGACY_HOME_KEY = 'helpy-mascot-home'

export interface BubbleOptions {
  /** What ends this bubble (see BubbleTopic). Default: 'prompt' with actions or an input, else 'notice'. */
  topic?: BubbleTopic
  tone?: 'default' | 'alert'
  actions?: BubbleAction[]
  input?: BubbleInput
}

/**
 * P4's way to drive Helpy. Writes the shared mascot store (src/shared/mascot.ts), which the voice
 * agent writes too, and adds what only the UI needs: bubble buttons, the red alert tone, what ends a bubble.
 */
export const mascot = {
  setState(state: MascotState) {
    shared.setState(state)
  },

  /** Shows `text` until a new bubble replaces it or its topic is resolved (never by a timer). */
  bubble(text: string | null, options: BubbleOptions = {}) {
    shared.bubble(text)
    const actions = options.actions ?? []
    const input = options.input ?? null
    const topic = options.topic ?? (actions.length || input ? 'prompt' : 'notice')
    useHelpyExtras.setState({
      bubbleExtras: text ? { text, tone: options.tone ?? 'default', actions, input, topic, pointedAt: useMascot.getState().pointTarget } : null,
    })
  },

  /** The topic of the bubble on screen (null when none, or when it was set without the P4 api). */
  bubbleTopic(): BubbleTopic | null {
    const extras = useHelpyExtras.getState().bubbleExtras
    return extras && extras.text === useMascot.getState().bubble ? extras.topic : null
  },

  /**
   * Something meaningful happened that ends bubbles of these topics: clears the bubble if it is one,
   * and stops pointing at what it explained. Returns true when a bubble was cleared.
   */
  resolve(...topics: BubbleTopic[]): boolean {
    const extras = useHelpyExtras.getState().bubbleExtras
    if (!extras || extras.text !== useMascot.getState().bubble || !topics.includes(extras.topic)) return false
    mascot.bubble(null)
    if (extras.pointedAt && useMascot.getState().pointTarget === extras.pointedAt) mascot.pointTo(null)
    return true
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

  /** Guardrail moment: red eyes, point at the field, say why. Stays until the trainee fixed it (Teach replaces it). */
  alert(targetId: string | null, text: string, actions: BubbleAction[] = []) {
    shared.setState('alert')
    mascot.pointTo(targetId, 'alert')
    mascot.bubble(text, { tone: 'alert', actions, topic: 'step' })
  },

  reset() {
    mascot.bubble(null)
    mascot.pose(null)
    mascot.pointTo(null)
    shared.setState('idle')
  },

  /** Forgets a resting spot an older version stored after a drag (it could park Helpy anywhere). */
  forgetLegacyHome() {
    try {
      localStorage.removeItem(LEGACY_HOME_KEY)
    } catch {
      // Storage can be unavailable; nothing to forget then.
    }
  },
}
