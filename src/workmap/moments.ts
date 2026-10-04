// The Work Map as a clickable timeline: every step and guardrail at the screen moment it came from.
import type { ScreenMoment, WorkMap } from '../shared/types'

const CLIP_BEFORE_MS = 8000
const CLIP_AFTER_MS = 8000

/** The part of the recording replayed for a moment: 8 s before to 8 s after, never before the start. */
export const clipAround = (t: number) => ({ start: Math.max(0, t - CLIP_BEFORE_MS), end: t + CLIP_AFTER_MS })

export interface TimelineEntry {
  kind: 'step' | 'guardrail'
  id: string
  /** The step to open for this entry (a guardrail opens the step it belongs to). */
  stepId: string | null
  title: string
  /** null: no captured screen moment backs it (said in the debrief, or nothing on screen nearby). */
  moment: ScreenMoment | null
}

/**
 * Steps and guardrails in recording order. Entries without a screen moment come last, marked as such,
 * instead of getting a made-up time.
 */
export function workMapTimeline(wm: WorkMap): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...wm.steps.map((s): TimelineEntry => ({ kind: 'step', id: s.id, stepId: s.id, title: s.title, moment: s.moment ?? null })),
    ...wm.guardrails.map((g): TimelineEntry => ({ kind: 'guardrail', id: g.id, stepId: g.stepId ?? null, title: g.text, moment: g.moment ?? null })),
  ]
  const order = new Map(wm.steps.map((s) => [s.id, s.index]))
  return entries.sort((a, b) => {
    if (a.moment && b.moment) return a.moment.t - b.moment.t || (a.kind === 'step' ? -1 : 1)
    if (a.moment || b.moment) return a.moment ? -1 : 1
    return (order.get(a.stepId ?? '') ?? 99) - (order.get(b.stepId ?? '') ?? 99)
  })
}

/** How many steps and guardrails are linked to a captured screen moment. */
export function momentCoverage(wm: WorkMap) {
  const linked = (m: ScreenMoment | null | undefined) => !!m
  return {
    steps: wm.steps.filter((s) => linked(s.moment)).length,
    guardrails: wm.guardrails.filter((g) => linked(g.moment)).length,
    total: wm.steps.length + wm.guardrails.length,
  }
}
