import { create } from 'zustand'

// What the shared contract (src/shared/mascot.ts) does not cover: bubble buttons, alert tone, resting spot.
// State, bubble text and pointing target live in the shared store, so the voice agent and P4 drive the same robot.

export interface BubbleAction {
  label: string
  onClick: () => void
  primary?: boolean
}

/** Resting spot, measured from the bottom-right corner of the bounds. */
export interface HomeOffset {
  right: number
  bottom: number
}

interface HelpyExtras {
  /** Buttons and tone for one bubble text; ignored once the text changes (e.g. the agent speaks). */
  bubbleExtras: { text: string; tone: 'default' | 'alert'; actions: BubbleAction[] } | null
  tone: 'default' | 'alert'
  home: HomeOffset
}

export const DEFAULT_HOME: HomeOffset = { right: 24, bottom: 24 }

export const useHelpyExtras = create<HelpyExtras>()(() => ({
  bubbleExtras: null,
  tone: 'default',
  home: DEFAULT_HOME,
}))
