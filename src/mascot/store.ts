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

/**
 * What ends a bubble, besides the next bubble replacing it. Never a timeout: a bubble stays until
 * something meaningful happened (see src/app/bubbleLifecycle.ts).
 * - notice:   plain information. Ends when the user engages Helpy, works in the app or speaks.
 * - prompt:   has buttons or an answer field. Ends by its own action, or when Helpy's panel opens.
 * - question: a question Helpy asked aloud. Ends with the answer.
 * - step:     Teach guidance for the open invoice. Ends with the next step, or when the invoice is closed.
 * - waiting:  "I have a question for you". Ends when that question is asked or dropped.
 */
export type BubbleTopic = 'notice' | 'prompt' | 'question' | 'step' | 'waiting'

interface HelpyExtras {
  /** Buttons, tone and topic for one bubble text; ignored once the text changes (e.g. the agent speaks). */
  bubbleExtras: {
    text: string
    tone: 'default' | 'alert'
    actions: BubbleAction[]
    input: BubbleInput | null
    topic: BubbleTopic
    /** What Helpy pointed at when this bubble appeared: the bubble explains it, so they end together. */
    pointedAt: string | null
  } | null
  tone: 'default' | 'alert'
  pose: Pose | null
  /** Rests in the middle of the screen instead of its corner (the first hello to a new visitor). */
  centered: boolean
}

export const useHelpyExtras = create<HelpyExtras>()(() => ({
  bubbleExtras: null,
  tone: 'default',
  pose: null,
  centered: false,
}))
