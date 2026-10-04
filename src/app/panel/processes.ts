import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { FIXTURE_WORKMAP } from '../../erp/fixtures'
import type { WorkMap } from '../../shared/types'
import { UNNAMED } from '../recordName'

export const EXAMPLE_ID = 'example'

export interface Process {
  id: string
  name: string
  example: boolean
  /** Newest first. `recordedBy`: who was signed in (null for recordings from before the sign-in). */
  recordings: { taskId: string; startedAt: number; durationMs: number | null; finished: boolean; recordedBy: string | null }[]
  /** Everyone who recorded it, newest first. */
  people: string[]
  /** Session of the Work Map, or of the newest recording while there is no map yet (session id = task id). */
  sessionId: string | null
  workMap: WorkMap | null
}

export type Status = 'recording' | 'not_recorded' | 'processing' | 'questions' | 'ready'

export const STATUS: Record<Status, { label: string; tone: string }> = {
  recording: { label: 'Recording now', tone: 'text-[#c2410c]' },
  not_recorded: { label: 'Not recorded yet', tone: 'text-faint' },
  processing: { label: 'Writing it down', tone: 'text-muted' },
  questions: { label: 'Has questions', tone: 'text-ask' },
  ready: { label: 'Ready to learn', tone: 'text-helpy' },
}

export function statusOf(p: Process): Status {
  if (p.recordings[0] && !p.recordings[0].finished) return 'recording'
  if (!p.workMap) return p.recordings.length ? 'processing' : 'not_recorded'
  return p.workMap.teachback?.confirmed ? 'ready' : 'questions'
}

const EXAMPLE: Process = {
  id: EXAMPLE_ID,
  name: FIXTURE_WORKMAP.task,
  example: true,
  recordings: [],
  people: [FIXTURE_WORKMAP.expert],
  sessionId: FIXTURE_WORKMAP.sessionId,
  workMap: FIXTURE_WORKMAP,
}

/** Everything Helpy knows: recorded processes from Convex plus the hand-written example. */
export function useProcesses(): Process[] | undefined {
  const data = useQuery(api.processes.list)
  if (data === undefined) return undefined
  const own = data.map((p): Process => {
    const withMap = p.recordings.find((r) => r.workMap)
    const workMap = (withMap?.workMap as WorkMap | undefined) ?? null
    return {
      id: p.id,
      // Nobody said what it was: the Work Map's task name, once there is one.
      name: p.name === UNNAMED && workMap?.task ? workMap.task : p.name,
      example: false,
      recordings: p.recordings,
      people: [...new Set([...p.recordings.map((r) => r.recordedBy), p.createdBy].filter((n): n is string => !!n))],
      sessionId: (withMap ?? p.recordings[0])?.taskId ?? null,
      workMap,
    }
  })
  return [...own, EXAMPLE]
}

export function useProcess(id: string | null): Process | null | undefined {
  const all = useProcesses()
  if (all === undefined) return undefined
  return all.find((p) => p.id === id) ?? null
}
