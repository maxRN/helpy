import mitt from 'mitt'
import { isPersonText, redactText } from './privacy'
import { sessionClock } from './session'
import type { AppEvent } from './types'

type BusEvents = {
  event: AppEvent
}

export const bus = mitt<BusEvents>()

const log: AppEvent[] = []
let counter = 0

/** Fills in id and t (ms since session.t0), stores the event in the log and broadcasts it. */
export function emitEvent(partial: Omit<AppEvent, 'id' | 't'> & { t?: number }): AppEvent {
  const now = Date.now()
  const t0 = sessionClock()
  const event: AppEvent = {
    ...partial,
    // Personal data in what people say or type never reaches the log, the database or a model.
    ...(partial.text && isPersonText(partial) ? { text: redactText(partial.text) } : {}),
    id: `e${++counter}-${now.toString(36)}`,
    t: partial.t ?? (t0 === null ? 0 : now - t0),
  }
  log.push(event)
  bus.emit('event', event)
  return event
}

/** Everything emitted since the page loaded (or since clearEventLog). */
export const getEventLog = (): readonly AppEvent[] => log

export function clearEventLog() {
  log.length = 0
}
