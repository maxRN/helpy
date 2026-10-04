// Connects P2's voice layer (src/agent) to the rest of the app.
// P2 has its own event shape ({ type, text, meta }); this file translates in both directions,
// so neither the agent code nor the shared contract has to change.
import { setDeps } from '../agent/deps'
import type { AppEvent as AgentEvent, Deps, Guardrail as AgentGuardrail } from '../agent/types'
import { TARGETS } from '../erp/catalog'
import { isRelevant } from '../erp/guardrails'
import { formatUSD, type Invoice } from '../erp/model'
import { getNextStep } from '../erp/stepTracker'
import { erp } from '../erp/store'
import { activity } from '../shared/activity'
import { bus, emitEvent } from '../shared/bus'
import { mascot, useMascot } from '../shared/mascot'
import { session } from '../shared/session'
import type { AppEvent, Quote, WorkMap } from '../shared/types'
import { speech } from './listener'

const SCREEN_KINDS = new Set<AppEvent['kind']>(['invoice_opened', 'field_changed', 'action'])
const AGENT_KINDS = new Set<AppEvent['kind']>([
  'utterance',
  'question_asked',
  'answer_given',
  'off_record_start',
  'off_record_end',
  'teachback_given',
  'teachback_result',
  'tutor_intervention',
])

const ACTION_LABEL = { hold: 'put on hold', request_approval: 'sent for a second approval', post: 'posted' } as const

const targetLabel = (targetId?: string) => TARGETS.find((t) => t.id === targetId)?.label.toLowerCase() ?? targetId ?? 'field'

/** One line of plain English per screen event, as the agent should hear it. */
export function describeScreenEvent(e: AppEvent): string | undefined {
  if (e.source === 'vision') return e.text // the vision model already wrote the sentence
  const inv = e.invoiceId ? erp().invoices[e.invoiceId] : undefined
  switch (e.kind) {
    case 'invoice_opened':
      if (!inv) return `Opened invoice ${e.invoiceId}`
      return `Opened invoice ${inv.number} from ${inv.supplierName} (${formatUSD(inv.amount)}, ${inv.category}${inv.supplierVerified ? '' : ', supplier not in vendor master'})`
    case 'field_changed':
      return `Invoice ${e.invoiceId}: ${targetLabel(e.targetId)} ${e.from || '(empty)'} → ${e.to || '(empty)'}`
    case 'action':
      return `Invoice ${e.invoiceId}: ${e.action ? ACTION_LABEL[e.action] : 'action'}${e.text ? ` (note: "${e.text}")` : ''}`
    default:
      return e.text
  }
}

/** P1 event → what P2 listens for. One event can mean two things to the agent (screen + tutor cue). */
export function toAgentEvents(e: AppEvent): AgentEvent[] {
  const meta = e.meta ?? {}

  // Events the agent emitted itself come back with their original type and id.
  if (typeof meta.agentType === 'string') {
    return [{ id: String(meta.agentId ?? e.id), t: e.t, type: meta.agentType, speaker: e.speaker, text: e.text, meta: (meta.agentMeta as Record<string, unknown>) ?? {} }]
  }

  // A vision event that repeats an ERP click: the agent already heard about it.
  if (e.source === 'vision' && meta.confirms) return []

  if ((e.source === 'dom' || e.source === 'vision') && SCREEN_KINDS.has(e.kind)) {
    const out: AgentEvent[] = [
      { id: e.id, t: e.t, type: e.source, text: describeScreenEvent(e), meta: { ...meta, kind: e.kind, invoiceId: e.invoiceId, targetId: e.targetId } },
    ]
    if (e.kind === 'invoice_opened' && e.invoiceId && e.source === 'dom') {
      out.push({ id: `${e.id}-open`, t: e.t, type: 'invoice_opened', meta: { invoiceId: e.invoiceId, fields: erp().invoices[e.invoiceId] } })
    }
    return out
  }

  if (e.kind === 'guardrail_violation') {
    const quote = meta.quote as Quote | undefined
    return [{ id: e.id, t: e.t, type: e.kind, text: e.text, meta: { guardrailId: meta.guardrailId, rule: e.text, quote: quote?.text, stepId: meta.stepId, invoiceId: e.invoiceId } }]
  }

  if (e.kind === 'sequence_deviation') {
    const stepId = meta.expectedStepId as string | undefined
    const step = session().workMap?.steps.find((s) => s.id === stepId)
    return [{ id: e.id, t: e.t, type: e.kind, text: e.text, meta: { stepId, stepName: step?.title, invoiceId: e.invoiceId } }]
  }

  return [{ id: e.id, t: e.t, type: e.kind, speaker: e.speaker, text: e.text, meta }]
}

/** P2 event → shared bus. Keeps the agent's type and id so it can recognise its own events. */
export function fromAgentEvent(a: AgentEvent): AppEvent {
  const kind = AGENT_KINDS.has(a.type as AppEvent['kind']) ? (a.type as AppEvent['kind']) : 'utterance'
  if (a.type === 'off_record_start') session().setOffRecord(true)
  if (a.type === 'off_record_end') session().setOffRecord(false)
  return emitEvent({
    source: 'voice',
    kind,
    t: a.t,
    speaker: a.speaker,
    text: a.text,
    meta: { ...a.meta, agentType: a.type, agentId: a.id, agentMeta: a.meta ?? {} },
  })
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** The Work Map as compact markdown for the tutor's prompt. */
export function workMapMarkdown(w: WorkMap): string {
  const steps = [...w.steps]
    .sort((a, b) => a.index - b.index)
    .map((s, i) => {
      const reason = s.reason ? ` Reason, in ${w.expert}'s words: "${s.reason.text}" (${mmss(s.reason.t)}).` : ''
      const rules = s.guardrailIds.length ? ` Guardrails: ${s.guardrailIds.join(', ')}.` : ''
      return `${i + 1}. [${s.id}, target ${s.targetId ?? '-'}] ${s.title}. Decision: ${s.decision}.${reason}${rules}${s.isJudgmentCall ? ' (judgment call)' : ''}`
    })
    .join('\n')
  const guardrails = w.guardrails
    .map((g) => `- ${g.id} (${g.severity === 'block' ? 'stop before posting' : 'ask, do not block'}): ${g.text} ${w.expert}: "${g.quote.text}"${g.stepId ? ` Step ${g.stepId}.` : ''}`)
    .join('\n')
  const open = w.openQuestions.length ? `\n\n## Still unclear\n${w.openQuestions.map((q) => `- ${q}`).join('\n')}` : ''
  return `# Work Map: ${w.task} (expert: ${w.expert})\n\n## Steps\n${steps}\n\n## Guardrails\n${guardrails}${open}`
}

let voiceT0: number | null = null

/** Call once on the client before using src/agent/voice.ts. */
export function installVoiceBridge() {
  const deps: Deps = {
    bus: {
      emit: (a) => void fromAgentEvent(a),
      on: (type, fn) => {
        const handler = (e: AppEvent) => {
          for (const a of toAgentEvents(e)) if (type === '*' || a.type === type) fn(a)
        }
        bus.on('event', handler)
        return () => bus.off('event', handler)
      },
    },
    session: {
      // Recording start if there is one; otherwise the moment the voice session started.
      get t0() {
        return session().t0 ?? (voiceT0 ??= Date.now())
      },
    },
    activity: { lastTypingAt: activity.lastTypingAt },
    speech: { lastSpeechAt: speech.lastSpeechAt, active: speech.active, turnOpen: speech.isSpeaking, replyPending: speech.replyPending },
    isSpeaking: () => useMascot.getState().state === 'speaking',
    language: () => session().language,
    mascot: {
      setState: (s) => mascot.setState(s),
      bubble: (text) => mascot.bubble(text),
      pointTo: (targetId) => mascot.pointTo(targetId),
      waiting: (question) => mascot.waiting(question),
    },
    getNextStep: () => {
      const openId = erp().openId
      if (!openId) {
        const next = Object.values(erp().invoices).find((i) => i.status === 'open' && (session().mode !== 'teach' || i.teachOnly))
        return next ? { stepId: 'open-invoice', targetId: `row-${next.id}`, text: `Open invoice ${next.number} from ${next.supplierName}.` } : null
      }
      const step = getNextStep(openId)
      if (!step) return null
      const why = step.reason ? ` ${session().workMap?.expert ?? 'The expert'} said: "${step.reason.text}"` : ''
      return { stepId: step.id, targetId: step.targetId ?? '', text: `${step.title}.${why}` }
    },
    showExpertClip: (stepId) => mascot.showExpertClip(stepId),
    getWorkMapMarkdown: () => {
      const w = session().workMap
      return w ? workMapMarkdown(w) : ''
    },
    matchGuardrails: (fields) => {
      const w = session().workMap
      if (!w) return []
      const invoice = fields as unknown as Invoice
      return w.guardrails
        .filter((g) => g.severity === 'block' && isRelevant(invoice, g))
        .map((g): AgentGuardrail => ({ id: g.id, rule: g.text, quote: g.quote.text, stepId: g.stepId ?? '' }))
    },
  }
  setDeps(deps)
}

export const resetVoiceClock = () => {
  voiceT0 = null
}
