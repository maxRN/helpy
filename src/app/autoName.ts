// After a recording, Claude names the process from what was done and said, so nobody has to decide a name
// up front. A name given by hand (rename in Helpy's app) is never overwritten: only "New recording" is.
import type { ConvexReactClient } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { toLogLines } from '../debrief/sessionLog'
import { getEventLog } from '../shared/bus'
import { UNNAMED } from './recordName'

/** Names the process of a finished recording, if it still has the placeholder name. Never throws. */
export async function nameRecording(convex: ConvexReactClient, projectId: string): Promise<string | null> {
  try {
    const log = toLogLines(getEventLog())
    if (log.length < 2) return null // nothing to name it after; it stays "New recording" and can be renamed
    const res = await fetch('/api/helpy/name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: log.slice(-200) }),
    })
    if (!res.ok) return null
    const { title } = (await res.json()) as { title?: string }
    if (!title) return null
    const project = await convex.query(api.projects.get, { projectId })
    if (!project || project.name !== UNNAMED) return null // renamed by hand meanwhile: keep that
    await convex.mutation(api.projects.rename, { projectId: projectId as Id<'projects'>, name: title })
    return title
  } catch (err) {
    console.warn('[helpy] could not name the recording', err)
    return null
  }
}
