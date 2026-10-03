import { useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Loops the recorded screenshots between start and end (ms into the capture task). */
export function ClipPlayer({ taskId, start, end }: { taskId: string; start: number; end: number }) {
  const frames = useQuery(api.debrief.clipFrames, { taskId, from: start, to: end })
  const [i, setI] = useState(0)

  useEffect(() => {
    setI(0)
    if (!frames || frames.length < 2) return
    const timer = setInterval(() => setI((n) => (n + 1) % frames.length), 700)
    return () => clearInterval(timer)
  }, [frames])

  const frame = frames?.[i]
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <div className="flex aspect-video w-full max-w-full items-center justify-center overflow-hidden rounded-sm bg-slate-900">
        {frame?.url ? (
          <img src={frame.url} alt={`Screen at ${mmss(frame.offsetMs)}`} className="h-full w-full object-contain" />
        ) : (
          <span className="px-4 text-center text-[12px] text-slate-400">
            {frames === undefined ? 'Loading clip…' : 'No screenshots for this moment. Record a task to get clips.'}
          </span>
        )}
      </div>
      <figcaption className="text-[11px] text-slate-500">
        Screen moment {mmss(start)}–{mmss(end)}
        {frame ? ` · frame ${mmss(frame.offsetMs)}` : ''}
      </figcaption>
    </figure>
  )
}
