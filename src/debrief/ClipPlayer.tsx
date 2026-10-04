import { useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Loops the recorded screenshots between start and end (ms into the capture task). Can be enlarged. */
export function ClipPlayer({ taskId, start, end }: { taskId: string; start: number; end: number }) {
  const frames = useQuery(api.debrief.clipFrames, { taskId, from: start, to: end })
  const [i, setI] = useState(0)
  const [large, setLarge] = useState(false)

  useEffect(() => {
    setI(0)
    if (!frames || frames.length < 2) return
    const timer = setInterval(() => setI((n) => (n + 1) % frames.length), 700)
    return () => clearInterval(timer)
  }, [frames])

  useEffect(() => {
    if (!large) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLarge(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [large])

  const frame = frames?.[i]
  const caption = `Screen moment ${mmss(start)}–${mmss(end)}${frame ? ` · frame ${mmss(frame.offsetMs)}` : ''}`

  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <div className="relative flex aspect-video w-full max-w-full items-center justify-center overflow-hidden rounded-sm bg-slate-900">
        {frame?.url ? (
          <button type="button" onClick={() => setLarge(true)} className="h-full w-full cursor-zoom-in" aria-label="Enlarge the screen moment">
            <img src={frame.url} alt={`Screen at ${mmss(frame.offsetMs)}`} className="h-full w-full object-contain" />
          </button>
        ) : (
          <span className="px-4 text-center text-[12px] text-slate-400">
            {frames === undefined ? 'Loading clip…' : 'No screenshots for this moment. Record a task to get clips.'}
          </span>
        )}
        {frame?.url ? (
          <button
            type="button"
            onClick={() => setLarge(true)}
            className="absolute right-2 bottom-2 rounded-sm bg-black/60 px-2 py-1 text-[12px] font-medium text-white hover:bg-black/80"
          >
            ⤢ Enlarge
          </button>
        ) : null}
      </div>
      <figcaption className="text-[11px] text-slate-500">{caption}</figcaption>

      {large && frame?.url ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Screen moment, enlarged"
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-2 bg-black/85 p-4"
          onClick={() => setLarge(false)}
        >
          <img
            src={frame.url}
            alt={`Screen at ${mmss(frame.offsetMs)}`}
            className="max-h-[88vh] max-w-full rounded-sm object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex items-center gap-3 text-[13px] text-slate-200">
            <span>{caption}</span>
            <button type="button" onClick={() => setLarge(false)} className="rounded-sm bg-white/15 px-2 py-1 hover:bg-white/25">
              Close (Esc)
            </button>
          </div>
        </div>
      ) : null}
    </figure>
  )
}
