import { create } from 'zustand'

// What the shared contract (src/shared/mascot.ts) does not cover: bubble buttons and answer field, alert tone, poses.
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

interface HelpyExtras {
  /** Buttons and tone for one bubble text; ignored once the text changes (e.g. the agent speaks). */
  bubbleExtras: { text: string; tone: 'default' | 'alert'; actions: BubbleAction[]; input: BubbleInput | null } | null
  tone: 'default' | 'alert'
  pose: Pose | null
}

export const useHelpyExtras = create<HelpyExtras>()(() => ({
  bubbleExtras: null,
  tone: 'default',
  pose: null,
}))
