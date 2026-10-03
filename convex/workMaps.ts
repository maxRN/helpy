import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

/** Saves (or replaces) the Work Map of a session. */
export const save = mutation({
  args: { sessionId: v.string(), workMap: v.any() },
  returns: v.null(),
  handler: async (ctx, { sessionId, workMap }) => {
    const existing = await ctx.db
      .query('workMaps')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
      .unique()
    const savedAt = Date.now()
    if (existing) await ctx.db.patch('workMaps', existing._id, { workMap, savedAt })
    else await ctx.db.insert('workMaps', { sessionId, workMap, savedAt })
    return null
  },
})

/** The most recently saved Work Map, e.g. for the new hire on a second computer. */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query('workMaps').withIndex('by_savedAt').order('desc').first()
    return doc ? { sessionId: doc.sessionId, workMap: doc.workMap, savedAt: doc.savedAt } : null
  },
})

export const get = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const doc = await ctx.db
      .query('workMaps')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
      .unique()
    return doc?.workMap ?? null
  },
})
