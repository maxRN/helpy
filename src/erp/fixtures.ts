import type { Guardrail, Step, WorkMap } from '../shared/types'

// Hand-written guardrails and Work Map that match the demo invoices.
// For tests and for P2–P4 to build against until /api/workmap delivers real ones.
// Not used in the live demo: there, guardrails are compiled from Sabine's own words.

export const FIXTURE_GUARDRAILS: Guardrail[] = [
  {
    id: 'G1',
    text: 'Equipment over $5,000 is always capex (cost center 0400).',
    quote: { text: 'Equipment over five thousand is always capex.', t: 192_000, speaker: 'expert' },
    when: [
      { field: 'category', op: 'eq', value: 'equipment' },
      { field: 'amount', op: 'gt', value: 5000 },
    ],
    require: [{ field: 'account', op: 'eq', value: 'capex' }],
    severity: 'block',
    stepId: 'S3',
  },
  {
    id: 'G2',
    text: 'No asset number, no capex posting.',
    quote: { text: 'No asset number, no capex booking. Never.', t: 201_000, speaker: 'expert' },
    when: [{ field: 'account', op: 'eq', value: 'capex' }],
    require: [{ field: 'assetNumber', op: 'not_empty' }],
    severity: 'block',
    stepId: 'S4',
  },
  {
    id: 'G3',
    text: 'Kramer Industrial Supply double-bills in December: hold it, the controller releases it.',
    quote: { text: 'Kramer bills us twice every December, so I hold it and Weber releases it.', t: 265_000, speaker: 'expert' },
    when: [
      { field: 'supplierId', op: 'eq', value: 'SUP-1007' },
      { field: 'month', op: 'eq', value: 12 },
    ],
    require: [{ field: 'status', op: 'eq', value: 'on_hold' }],
    severity: 'block',
    stepId: 'S5',
  },
  {
    id: 'G4',
    text: 'Intercompany invoices from the Czech subsidiary need a second approval.',
    quote: { text: 'Anything from Brno gets a second pair of eyes.', t: 330_000, speaker: 'expert' },
    when: [
      { field: 'supplierCountry', op: 'eq', value: 'CZ' },
      { field: 'category', op: 'eq', value: 'intercompany' },
    ],
    require: [{ field: 'approvalRequested', op: 'eq', value: true }],
    severity: 'block',
    stepId: 'S6',
  },
]

const clip = (t: number) => ({ start: Math.max(0, t - 8000), end: t + 8000 })

export const FIXTURE_STEPS: Step[] = [
  { id: 'S1', index: 1, title: 'Open the invoice and check it against the PO', targetId: 'invoice-preview', clip: clip(20_000), decision: 'PO number matches, amounts match', guardrailIds: [], isJudgmentCall: false, confidence: 0.9 },
  { id: 'S2', index: 2, title: 'Check the category', targetId: 'field-category', clip: clip(150_000), decision: 'Category confirmed as equipment', guardrailIds: [], isJudgmentCall: false, confidence: 0.8 },
  { id: 'S3', index: 3, title: 'Code the invoice to a cost center', targetId: 'field-costCenter', clip: clip(192_000), decision: 'Re-coded from opex (4711) to capex (0400)', reason: { text: 'Equipment over five thousand is always capex.', t: 192_000, speaker: 'expert' }, guardrailIds: ['G1'], isJudgmentCall: true, confidence: 0.9 },
  { id: 'S4', index: 4, title: 'Enter the asset number', targetId: 'field-assetNumber', clip: clip(201_000), decision: 'Asset number from the PO entered', reason: { text: 'No asset number, no capex booking. Never.', t: 201_000, speaker: 'expert' }, guardrailIds: ['G2'], isJudgmentCall: false, confidence: 0.85 },
  { id: 'S5', index: 5, title: 'Hold known December double-billers', targetId: 'action-hold', clip: clip(265_000), decision: 'Kramer invoice put on hold', reason: { text: 'Kramer bills us twice every December, so I hold it and Weber releases it.', t: 265_000, speaker: 'expert' }, guardrailIds: ['G3'], isJudgmentCall: true, confidence: 0.75 },
  { id: 'S6', index: 6, title: 'Request a second approval for intercompany invoices from Brno', targetId: 'action-request_approval', clip: clip(330_000), decision: 'Second approval requested from J. Novak', reason: { text: 'Anything from Brno gets a second pair of eyes.', t: 330_000, speaker: 'expert' }, guardrailIds: ['G4'], isJudgmentCall: true, confidence: 0.8 },
  { id: 'S7', index: 7, title: 'Post the invoice', targetId: 'action-post', clip: clip(360_000), decision: 'Invoice posted', guardrailIds: [], isJudgmentCall: false, confidence: 0.95 },
]

export const FIXTURE_WORKMAP: WorkMap = {
  sessionId: 'fixture',
  task: 'Process supplier invoices before the December month-end close',
  expert: 'Sabine',
  language: 'en',
  steps: FIXTURE_STEPS,
  guardrails: FIXTURE_GUARDRAILS,
  openQuestions: ['Does the December hold apply to other suppliers too?'],
  teachback: { text: '', confirmed: true, corrections: [] },
}
