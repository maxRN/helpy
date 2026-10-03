import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const append = mutation({
  args: { sessionId: v.string(), event: v.any() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert('events', args)
    return null
  },
})

/** All AppEvents of a session, oldest first. */
export const list = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const docs = await ctx.db
      .query('events')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
      .collect()
    return docs.map((d) => d.event)
  },
})
