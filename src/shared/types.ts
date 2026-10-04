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
    | 'audio_saved'
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
  /** How the expert came to say it: answering a live question, in the debrief, correcting the teach-back, or unprompted. */
  via?: 'live_question' | 'debrief' | 'teachback' | 'narration'
}

/**
 * A captured screen moment: the time of a real screen event of the recording and what it showed.
 * Never made up: when nothing on screen backs a step or rule, `moment` is null instead.
 */
export interface ScreenMoment {
  t: number
  event: string
}

export interface Step {
  id: string
  index: number
  title: string
  targetId?: string // mascot points here in Teach
  clip: { start: number; end: number } // ms into the recording
  /** The screen event the step is linked to (null: no screen evidence; undefined: older Work Maps). */
  moment?: ScreenMoment | null
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
  text: string // "Equipment over €5,000 is always capex"
  quote: Quote
  when: Condition[] // all match → rule is relevant
  require: Condition[] // any fails → violation
  severity: 'block' | 'ask'
  stepId?: string
  /** The screen moment the rule was explained at (null: no screen evidence, e.g. a case only discussed in the debrief). */
  moment?: ScreenMoment | null
}

export interface WorkMap {
  sessionId: string
  task: string
  expert: string
  language: 'de' | 'en'
  steps: Step[]
  guardrails: Guardrail[]
  openQuestions: string[]
  /**
   * The teach-back and its outcome. `confirmed` is only true when the expert said it is right
   * (not when the debrief simply ended). `rounds`: how often Helpy explained it back.
   */
  teachback?: { text: string; confirmed: boolean; corrections: Quote[]; rounds?: number; confirmedAt?: number }
  /** Why Helpy believes it understood: the questions it asked and the reason it stopped asking. */
  debrief?: DebriefRecord
}

/** One question of the debrief and whether it was answered. */
export interface DebriefQuestion {
  id: string
  question: string
  kind: Gap['kind']
  /** Screen moment the question was about (ms into the recording). */
  t: number
  status: 'answered' | 'skipped'
}

export interface DebriefRecord {
  /** Questions asked live during the task (not repeated in the debrief). */
  live: { question: string; t: number; answered: boolean }[]
  questions: DebriefQuestion[]
  /** The server's reason for ending the debrief, as Helpy said it. */
  doneReason: string
  completedAt: number
}

export interface Gap {
  id: string
  stepId?: string
  clip: { start: number; end: number }
  question: string
  kind: 'why' | 'guardrail' | 'exception' | 'unseen_case'
}
