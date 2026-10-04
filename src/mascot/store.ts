import { create } from 'zustand'

// What the shared contract (src/shared/mascot.ts) does not cover: bubble buttons and answer field, alert tone, poses, resting spot.
// State, bubble text and pointing target live in the shared store, so the voice agent and P4 drive the same robot.

export interface BubbleAction {
  label: string
  onClick: () => void
  primary?: boolean
}

/** An answer field in the bubble: Helpy asks, you type (or pick a suggestion). */
export interface BubbleInput {
  placeholder: string
  submitLabel: string
  onSubmit: (value: string) => void
  suggestions?: string[]
}

/** Gestures on top of the state: wave hello, cheer, raise a hand (has a question). */
export type Pose = 'wave' | 'cheer' | 'question'

/** Resting spot, measured from the bottom-right corner of the bounds. */
export interface HomeOffset {
  right: number
  bottom: number
}

interface HelpyExtras {
  /** Buttons and tone for one bubble text; ignored once the text changes (e.g. the agent speaks). */
  bubbleExtras: { text: string; tone: 'default' | 'alert'; actions: BubbleAction[]; input: BubbleInput | null } | null
  tone: 'default' | 'alert'
  pose: Pose | null
  home: HomeOffset
}

export const DEFAULT_HOME: HomeOffset = { right: 24, bottom: 24 }

export const useHelpyExtras = create<HelpyExtras>()(() => ({
  bubbleExtras: null,
  tone: 'default',
  pose: null,
  home: DEFAULT_HOME,
}))
