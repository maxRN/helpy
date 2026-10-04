// When Helpy's speech bubble ends. Never on a timer: only when something meaningful happened.
// Each bubble has a topic (see BubbleTopic in src/mascot/store.ts); a new bubble always replaces the old one.
import { useErp } from '../erp/store'
import { mascot } from '../mascot'
import { bus } from '../shared/bus'
import { useMascot } from '../shared/mascot'
import type { AppEvent } from '../shared/types'
import { useHelpyApp } from './helpy-app/store'
import { usePanel } from './panel/store'

const WORK = new Set<AppEvent['kind']>(['invoice_opened', 'field_changed', 'action'])

/** Which bubble topics an event resolves. */
export function topicsResolvedBy(e: AppEvent): Parameters<typeof mascot.resolve> {
  // The user works on: information Helpy gave is no longer the point.
  if (e.source === 'dom' && WORK.has(e.kind)) return ['notice']
  // The user speaks: they responded to what Helpy said. Not when they spoke to Helpy ("Wie meinst du das?"):
  // that line is logged once Helpy already answers it, and the answer must stay.
  if (e.source === 'voice' && e.kind === 'utterance' && (e.speaker === 'expert' || e.speaker === 'trainee') && !e.meta?.toHelpy) return ['notice']
  return []
}

/** Call once on the client. Returns an uninstall function. */
export function installBubbleLifecycle(): () => void {
  const onEvent = (e: AppEvent) => {
    const topics = topicsResolvedBy(e)
    if (topics.length) mascot.resolve(...topics)
  }
  bus.on('event', onEvent)
  const offs = [
    () => bus.off('event', onEvent),
    // The user engages Helpy (its panel or its app opens): what it said before is answered or moot.
    usePanel.subscribe((s, prev) => {
      if (s.open && !prev.open) mascot.resolve('notice', 'prompt', 'step', 'waiting')
    }),
    useHelpyApp.subscribe((s, prev) => {
      if (s.open && !prev.open) mascot.resolve('notice', 'prompt', 'step', 'waiting')
    }),
    // Teach guidance belongs to the open invoice; back in the inbox it no longer applies.
    useErp.subscribe((s, prev) => {
      if (prev.openId && s.openId !== prev.openId) mascot.resolve('step')
    }),
    // "I have a question for you" ends when that question is asked or dropped.
    useMascot.subscribe((s, prev) => {
      if (prev.waiting && !s.waiting) mascot.resolve('waiting')
    }),
  ]
  return () => offs.forEach((off) => off())
}
