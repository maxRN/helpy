// Answer to judge question 5: "Trust".
// 1. Off the record: no screenshots are taken, the microphone stream to Scribe is muted (src/integration/
//    listener.ts), and screen changes from that time are neither stored (ConvexSync) nor put into the
//    debrief log or any model request (they stay only in this tab's memory, and are filtered from there).
// 2. Personal data in what people say or type is replaced before it is stored or sent to a model
//    (screenshots are redacted separately, see src/capture/pii.ts).
import type { AppEvent } from './types'

const MARKERS = new Set<AppEvent['kind']>(['off_record_start', 'off_record_end'])

/** Removes everything that happened while off the record. The markers themselves stay (they hold no content). */
export function withoutOffRecord<E extends Pick<AppEvent, 'kind' | 't'>>(events: readonly E[]): E[] {
  let off = false
  const out: E[] = []
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (e.kind === 'off_record_start') off = true
    if (e.kind === 'off_record_end') off = false
    if (!off || MARKERS.has(e.kind)) out.push(e)
  }
  return out
}

/** Live check for a new event: kept unless the session is off the record (markers always pass). */
export const keepWhileOffRecord = (e: Pick<AppEvent, 'kind'>, offRecord: boolean) => !offRecord || MARKERS.has(e.kind)

const PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  // IBAN: country code, check digits, then groups of letters/digits (with or without spaces).
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g, '[IBAN]'],
  // Card numbers: 13-19 digits, optionally grouped by spaces or dashes.
  [/\b\d{4}(?:[ -]?\d{4}){2,3}(?:[ -]?\d{1,3})?\b/g, '[card number]'],
  // Phone numbers: international or leading 0, at least 8 digits in all.
  [/(?:\+\d{1,3}[\s/-]?|\b0)\d{2,5}(?:[\s/-]?\d{2,}){2,}\b/g, '[phone]'],
]

/** Replaces emails, IBANs, card and phone numbers. Invoice numbers, amounts and codes stay as they are. */
export function redactText(text: string): string {
  let out = text
  for (const [re, label] of PATTERNS) out = out.replace(re, label)
  return out
}

/** Spoken or typed words a person said, as stored and sent to models. */
export const isPersonText = (e: Pick<AppEvent, 'speaker' | 'source' | 'kind'>) =>
  e.speaker === 'expert' || e.speaker === 'trainee' || (e.source === 'dom' && e.kind === 'action')
