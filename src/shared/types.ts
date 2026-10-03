// Shared contract. Change only after telling the team.

export type Mode = 'capture' | 'debrief' | 'workmap' | 'teach'
export type Speaker = 'expert' | 'trainee' | 'agent'

export interface AppEvent {
  id: string
  t: number // ms since session.t0 (= recording start)
  source: 'dom' | 'vision' | 'voice' | 'system'
  kind:
    | 'invoice_opened'
    | 'field_changed'
    | 'action'
    | 'utterance'
    | 'question_asked'
    | 'answer_given'
    | 'pause'
    | 'off_record_start'
    | 'off_record_end'
    | 'guardrail_violation'
    | 'sequence_deviation'
    // Recording lifecycle (P3), source 'system'
    | 'task_started'
    | 'task_finished'
    | 'screenshot_saved'
    | 'screenshot_analyzed'
    // Voice layer (P2), source 'voice'
    | 'teachback_given'
    | 'teachback_result'
    | 'tutor_intervention'
  invoiceId?: string
  targetId?: string // data-target of the ERP element
  from?: string
  to?: string
  action?: 'hold' | 'request_approval' | 'post'
  text?: string
  speaker?: Speaker
  meta?: Record<string, unknown>
}

export interface Quote {
  text: string
  t: number
  speaker: Speaker
}

export interface Step {
  id: string
  index: number
  title: string
  targetId?: string // mascot points here in Teach
  clip: { start: number; end: number } // ms into the recording
  decision: string // "Re-coded 4711 → 0400 (capex)"
  reason?: Quote
  guardrailIds: string[]
  isJudgmentCall: boolean
  confidence: number // 0..1
}

export type InvoiceField =
  | 'amount'
  | 'category'
  | 'supplierId'
  | 'supplierCountry'
  | 'supplierVerified'
  | 'month'
  | 'costCenter'
  | 'account'
  | 'assetNumber'
  | 'approvalRequested'
  | 'status'

export const INVOICE_FIELDS: InvoiceField[] = [
  'amount',
  'category',
  'supplierId',
  'supplierCountry',
  'supplierVerified',
  'month',
  'costCenter',
  'account',
  'assetNumber',
  'approvalRequested',
  'status',
]

export interface Condition {
  field: InvoiceField
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'empty' | 'not_empty'
  value?: unknown
}

export interface Guardrail {
  id: string
  text: string // "Equipment over $5,000 is always capex"
  quote: Quote
  when: Condition[] // all match → rule is relevant
  require: Condition[] // any fails → violation
  severity: 'block' | 'ask'
  stepId?: string
}

export interface WorkMap {
  sessionId: string
  task: string
  expert: string
  language: 'de' | 'en'
  steps: Step[]
  guardrails: Guardrail[]
  openQuestions: string[]
  teachback?: { text: string; confirmed: boolean; corrections: Quote[] }
}

export interface Gap {
  id: string
  stepId?: string
  clip: { start: number; end: number }
  question: string
  kind: 'why' | 'guardrail' | 'exception' | 'unseen_case'
}
