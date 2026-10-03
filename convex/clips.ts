import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { query, type QueryCtx } from './_generated/server'

// Read-only access to a recording's screenshots for the clip player (P4).
// Frame offsets are ms since the recording started, the same clock as AppEvent.t and Step.clip.

async function framesFor(ctx: QueryCtx, taskId: Id<'tasks'>) {
  const task = await ctx.db.get('tasks', taskId)
  if (!task) return null
  const screenshots = await ctx.db.query('screenshots').withIndex('by_task', (q) => q.eq('taskId', taskId)).collect()
  const frames = await Promise.all(
    screenshots.map(async (s) => ({ offsetMs: s.offsetMs, url: await ctx.storage.getUrl(s.storageId) })),
  )
  return {
    taskId,
    startedAt: task.startedAt,
    durationMs: task.completion?.durationMs ?? null,
    frames: frames.filter((f): f is { offsetMs: number; url: string } => f.url !== null),
  }
}

export const forTask = query({
  args: { taskId: v.string() },
  handler: async (ctx, { taskId }) => {
    const id = ctx.db.normalizeId('tasks', taskId)
    return id ? framesFor(ctx, id) : null
  },
})
