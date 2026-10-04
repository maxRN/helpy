// Turns the session's AppEvents into the plain log the debrief models read.
import { describeScreenEvent } from '../integration/voiceBridge'
import type { LogLine } from '../server/debrief'
import type { AppEvent } from '../shared/types'

const SCREEN_KINDS = new Set<AppEvent['kind']>(['invoice_opened', 'field_changed', 'action'])

export function toLogLines(events: readonly AppEvent[]): LogLine[] {
  const lines: LogLine[] = []
  for (const e of events) {
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
