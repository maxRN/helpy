import { useCallback, useState } from 'react'
import { clipAround } from '../../workmap/moments'
import type { Quote, ScreenMoment } from '../../shared/types'
import { mmss } from '../panel/ui'
import { ClipLightbox } from '../player/EnlargeableClip'

const VIA: Record<NonNullable<Quote['via']>, string> = {
  live_question: 'live question',
  debrief: 'debrief',
  teachback: 'teach-back correction',
  narration: 'while working',
}

/** "Sabine, live question at 03:15": who said it, how and when. */
export function quoteSource(expert: string, q: Quote) {
  return `${expert}, ${q.via ? `${VIA[q.via]} at ` : ''}${mmss(q.t)}`
}

/**
 * A clickable timestamp of a captured screen moment: opens the expert's screen at that moment.
 * `moment === null` says plainly that there is no screen evidence; `undefined` (hand-written or older
 * Work Maps) shows nothing.
 */
export function MomentLink({ sessionId, moment, title, missing = 'No screen moment' }: { sessionId: string | null; moment: ScreenMoment | null | undefined; title: string; missing?: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  if (moment === undefined) return null
  if (moment === null) return <span className="inline-flex h-9 items-center rounded-lg bg-rule-soft px-2.5 text-[14px] text-muted">{missing}</span>
  const clip = clipAround(moment.t)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={moment.event}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-helpy-soft px-2.5 text-[14px] font-semibold text-helpy tabular-nums transition-colors duration-150 hover:bg-helpy hover:text-white"
      >
        <svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden>
          <path d="M4 2.5v11l9-5.5z" />
        </svg>
        <span className="sr-only">Play the screen at </span>
        {mmss(moment.t)}
      </button>
      {open ? <ClipLightbox sessionId={sessionId} start={clip.start} end={clip.end} title={title} caption={`Screen moment ${mmss(moment.t)}: ${moment.event}`} onClose={close} /> : null}
    </>
  )
}
