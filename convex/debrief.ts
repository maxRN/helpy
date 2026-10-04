import { v } from 'convex/values'
import { query } from './_generated/server'

/** Screenshots of a capture task between two offsets (ms), with URLs: the frames of a debrief clip. */
export const clipFrames = query({
  args: { taskId: v.string(), from: v.number(), to: v.number() },
  handler: async (ctx, { taskId, from, to }) => {
    const id = ctx.db.normalizeId('tasks', taskId)
    if (!id) return []
    const shots = await ctx.db
      .query('screenshots')
      .withIndex('by_task', (q) => q.eq('taskId', id).gte('offsetMs', from).lte('offsetMs', to))
      .collect()
    return Promise.all(shots.map(async (s) => ({ offsetMs: s.offsetMs, url: s.storageId ? await ctx.storage.getUrl(s.storageId) : null })))
  },
})
