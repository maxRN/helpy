import type { Id } from './_generated/dataModel'
import { query, type QueryCtx } from './_generated/server'

// What Helpy knows (P4): a process is a project, its recordings are tasks, and a recording's
// Work Map is stored in workMaps under the recording's session id, which is the task id.

async function recordingsOf(ctx: QueryCtx, projectId: Id<'projects'>) {
  const tasks = await ctx.db.query('tasks').withIndex('by_project', (q) => q.eq('projectId', projectId)).order('desc').collect()
  // A recording that failed before the first second (e.g. sharing cancelled) is not knowledge.
  const real = tasks.filter((t) => !(t.completion?.error && t.completion.durationMs === 0))
  return Promise.all(
    real.map(async (task) => {
      const map = await ctx.db.query('workMaps').withIndex('by_sessionId', (q) => q.eq('sessionId', task._id)).unique()
      return {
        taskId: task._id,
        startedAt: task.startedAt,
        recordedBy: task.recordedBy ?? null,
        durationMs: task.completion?.durationMs ?? null,
        finished: task.completion !== null,
        workMap: map?.workMap ?? null,
      }
    }),
  )
}

/** Every process with its recordings and newest Work Map. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query('projects').order('desc').collect()
    return Promise.all(projects.map(async (p) => ({ id: p._id, name: p.name, createdBy: p.createdBy ?? null, recordings: await recordingsOf(ctx, p._id) })))
  },
})
