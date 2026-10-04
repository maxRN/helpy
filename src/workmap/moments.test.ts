import { describe, expect, it } from 'vitest'
import { FIXTURE_WORKMAP } from '../erp/fixtures'
import type { WorkMap } from '../shared/types'
import { clipAround, momentCoverage, workMapTimeline } from './moments'

const wm: WorkMap = {
  ...FIXTURE_WORKMAP,
  steps: [
    { ...FIXTURE_WORKMAP.steps[0], id: 'S1', index: 1, moment: { t: 20_000, event: 'Opened invoice 4471' } },
    { ...FIXTURE_WORKMAP.steps[2], id: 'S2', index: 2, guardrailIds: ['G1'], moment: { t: 41_000, event: 'Invoice 4471: cost center 4711 → 0400 (capex)' } },
    { ...FIXTURE_WORKMAP.steps[6], id: 'S3', index: 3, guardrailIds: ['G5'], moment: null },
  ],
  guardrails: [
    { ...FIXTURE_WORKMAP.guardrails[0], id: 'G1', stepId: 'S2', moment: { t: 41_000, event: 'Invoice 4471: cost center 4711 → 0400 (capex)' } },
    { ...FIXTURE_WORKMAP.guardrails[4], id: 'G5', stepId: 'S3', moment: null },
  ],
}

describe('Work Map timeline', () => {
  it('orders steps and guardrails by their screen moment, the step before its rule', () => {
    expect(workMapTimeline(wm).map((e) => `${e.id}@${e.moment?.t ?? '-'}`)).toEqual(['S1@20000', 'S2@41000', 'G1@41000', 'S3@-', 'G5@-'])
  })

  it('a guardrail entry opens the step it belongs to', () => {
    const g1 = workMapTimeline(wm).find((e) => e.id === 'G1')!
    expect(g1).toMatchObject({ kind: 'guardrail', stepId: 'S2' })
  })

  it('keeps entries without screen evidence explicit instead of inventing a time', () => {
    const missing = workMapTimeline(wm).filter((e) => !e.moment)
    expect(missing.map((e) => e.id)).toEqual(['S3', 'G5'])
    expect(momentCoverage(wm)).toEqual({ steps: 2, guardrails: 1, total: 5 })
  })

  it('replays 8 s around the moment', () => {
    expect(clipAround(41_000)).toEqual({ start: 33_000, end: 49_000 })
  })
})
