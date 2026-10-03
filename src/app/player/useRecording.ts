import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export interface Frame {
  offsetMs: number
  url: string
}

export interface Recording {
  taskId: string
  startedAt: number
  durationMs: number | null
  frames: Frame[]
}

/**
 * The screen recording (screenshots every 2 s) behind a session; the session id is the capture task id.
 * `undefined` while loading, `null` if there is none (e.g. the example Work Map).
 */
export function useRecording(sessionId: string | null): Recording | null | undefined {
  const skip = !sessionId || sessionId === 'fixture'
  const data = useQuery(api.clips.forTask, skip ? 'skip' : { taskId: sessionId })
  return skip ? null : data
}

/** Frames that cover [start, end], including the one already on screen at `start`. */
export function framesBetween(frames: Frame[], start: number, end: number): Frame[] {
  const sorted = [...frames].sort((a, b) => a.offsetMs - b.offsetMs)
  const before = sorted.filter((f) => f.offsetMs <= start).at(-1)
  return [...(before ? [before] : []), ...sorted.filter((f) => f.offsetMs > start && f.offsetMs <= end)]
}
