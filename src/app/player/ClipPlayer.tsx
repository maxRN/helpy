import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { mmss } from '../panel/ui'
import { framesBetween, useRecording } from './useRecording'

interface ClipPlayerProps {
  /** Session whose recording is played. `null` or 'fixture' shows `empty` instead. */
  sessionId: string | null
  start: number
  end: number
  autoPlay?: boolean
  /** Pauses from outside, e.g. while the explainer narrates. */
  paused?: boolean
  onEnded?: () => void
  empty?: ReactNode
  className?: string
}

const TICK_MS = 100

/**
 * Replays a moment of the expert's screen. The recording is a screenshot every 2 s (Convex),
 * so frames cross-fade with a slow zoom instead of being shown as a stuttering video.
 * Swap the inside for a <video> once P3 records WebM; the props stay the same.
 */
export function ClipPlayer({ sessionId, start, end, autoPlay = true, paused = false, onEnded, empty, className = '' }: ClipPlayerProps) {
  const recording = useRecording(sessionId)
  const frames = useMemo(() => (recording ? framesBetween(recording.frames, start, end) : []), [recording, start, end])
  const [t, setT] = useState(start)
  const [playing, setPlaying] = useState(autoPlay)
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded

  useEffect(() => {
    setT(start)
    setPlaying(autoPlay)
  }, [start, end, autoPlay])

  const running = playing && !paused && frames.length > 0
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      setT((prev) => {
        const next = prev + TICK_MS
        if (next >= end) {
          setPlaying(false)
          setTimeout(() => endedRef.current?.(), 0)
          return end
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [running, end])

  const current = frames.reduce((acc, f, i) => (f.offsetMs <= t ? i : acc), 0)
  const progress = end > start ? (t - start) / (end - start) : 0

  if (recording === undefined) {
    return <div className={`aspect-video animate-pulse rounded-xl bg-slate-200 ${className}`} aria-label="Loading recording" />
  }
  if (frames.length === 0) {
    return (
      <div className={`grid place-items-center rounded-xl bg-rule-soft px-6 py-10 text-center ${className}`}>
        {empty ?? (
          <p className="m-0 max-w-sm text-[15px] leading-relaxed text-muted">
            {sessionId && sessionId !== 'fixture'
              ? 'No picture of the screen was saved for this moment.'
              : 'Sabine’s real screen appears here once a session has been recorded.'}
          </p>
        )}
      </div>
    )
  }

  const toggle = () => {
    if (t >= end) setT(start)
    setPlaying((p) => !p)
  }

  return (
    <div className={`group relative aspect-video overflow-hidden rounded-xl bg-helpy-ink ${className}`}>
      {frames.map((f, i) => (
        <img
          key={f.url}
          src={f.url}
          alt={i === current ? `Screen at ${mmss(f.offsetMs)}` : ''}
          className="absolute inset-0 size-full object-contain transition-opacity duration-500"
          style={{ opacity: i === current ? 1 : 0, transform: `scale(${1 + 0.035 * progress})`, transformOrigin: 'center' }}
          draggable={false}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 text-white">
        <button
          type="button"
          onClick={toggle}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/90 text-helpy-ink hover:bg-white"
          aria-label={running ? 'Pause' : 'Play'}
        >
          {running ? (
            <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="ml-0.5 size-3.5" fill="currentColor" aria-hidden>
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={start}
          max={end}
          step={100}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-helpy-mint"
          aria-label="Position in clip"
        />
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-white/85">
          {mmss(t)} / {mmss(end)}
        </span>
      </div>
    </div>
  )
}
