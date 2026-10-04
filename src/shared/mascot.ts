// Mascot state, written by the voice agent (P2), rendered by P4's mascot.
// Until P4's mascot is mounted, pointTo() falls back to highlighting the element itself.
import { create } from 'zustand'
import { registry } from './registry'

export type MascotState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'alert'

interface MascotStore {
  state: MascotState
  bubble: string | null
  pointTarget: string | null
  /** Step whose expert clip should be replayed (P4 shows it). */
  clipRequest: { stepId: string; at: number } | null
  /** A live question the agent holds back while the expert is busy; P4 shows a raised hand instead of interrupting. */
  waiting: { text: string; since: number } | null
  /** P4 sets this to true when its mascot is mounted, which turns off the fallback highlight. */
  rendered: boolean
}

export const useMascot = create<MascotStore>(() => ({
  state: 'idle',
  bubble: null,
  pointTarget: null,
  clipRequest: null,
  waiting: null,
  rendered: false,
}))

function highlight(targetId: string) {
  const el = registry.get(targetId)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const before = el.style.outline
  el.style.outline = '3px solid #0ea5e9'
  el.style.outlineOffset = '3px'
  setTimeout(() => {
    el.style.outline = before
  }, 4000)
}

export const mascot = {
  setState(state: MascotState) {
    useMascot.setState({ state })
  },
  bubble(text: string | null) {
    useMascot.setState({ bubble: text })
  },
  pointTo(targetId: string | null) {
    useMascot.setState({ pointTarget: targetId })
    if (targetId && !useMascot.getState().rendered) highlight(targetId)
  },
  waiting(text: string | null) {
    useMascot.setState({ waiting: text ? { text, since: Date.now() } : null })
  },
  showExpertClip(stepId: string) {
    useMascot.setState({ clipRequest: { stepId, at: Date.now() } })
  },
}
