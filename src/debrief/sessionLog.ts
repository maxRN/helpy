// Turns the session's AppEvents into the plain log the debrief models read.
import { describeScreenEvent } from '../integration/voiceBridge'
import type { LogLine } from '../server/debrief'
import { withoutOffRecord } from '../shared/privacy'
import type { AppEvent } from '../shared/types'

const SCREEN_KINDS = new Set<AppEvent['kind']>(['invoice_opened', 'field_changed', 'action'])

/**
 * True when no guardrail question was asked during the task itself (the brief requires one).
 * Live questions carry their kind in meta (from the question policy); debrief questions are not counted.
 */
export function needsGuardrailQuestion(events: readonly AppEvent[]): boolean {
  return !events.some((e) => {
    if (e.kind !== 'question_asked') return false
    const meta = (e.meta ?? {}) as { kind?: string; phase?: string; agentMeta?: { kind?: string; phase?: string } }
    const kind = meta.kind ?? meta.agentMeta?.kind
    const phase = meta.phase ?? meta.agentMeta?.phase
    return kind === 'guardrail' && phase !== 'debrief'
  })
}

export function toLogLines(events: readonly AppEvent[]): LogLine[] {
  const lines: LogLine[] = []
  // What happened off the record never reaches the debrief, the Work Map or Helpy's answers.
  for (const e of withoutOffRecord(events)) {
    let line: LogLine | null = null
    if ((e.source === 'dom' || (e.source === 'vision' && !e.meta?.confirms)) && SCREEN_KINDS.has(e.kind)) {
      const text = describeScreenEvent(e)
      if (text) line = { t: e.t, who: 'screen', text }
    } else if (e.meta?.toHelpy) {
      continue // said to Helpy ("hörst du mich?"), not about the work
    } else if (e.text && (e.kind === 'utterance' || e.kind === 'answer_given' || e.kind === 'teachback_result')) {
      line = { t: e.t, who: e.speaker === 'agent' ? 'agent' : 'expert', text: e.text }
    } else if (e.text && (e.kind === 'question_asked' || e.kind === 'teachback_given')) {
      line = { t: e.t, who: 'agent', text: e.text }
    }
    if (!line) continue
    // The transcript logs an answer both as utterance and as answer_given: keep one.
    const dup = lines.some((l) => l.who === line.who && l.text === line.text && Math.abs(l.t - line.t) < 3000)
    if (!dup) lines.push(line)
  }
  return lines.sort((a, b) => a.t - b.t)
}
