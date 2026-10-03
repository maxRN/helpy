import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query('projects').order('desc').collect(),
})

export const get = query({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const id = ctx.db.normalizeId('projects', projectId)
    return id ? ctx.db.get('projects', id) : null
  },
})

export const create = mutation({
  args: { name: v.string() },
  returns: v.id('projects'),
  handler: async (ctx, { name }) => {
    const trimmedName = name.trim()
    if (!trimmedName) throw new ConvexError('Project name is required.')
    return ctx.db.insert('projects', { name: trimmedName })
  },
})

export const remove = mutation({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, { projectId }) => {
    await ctx.db.delete('projects', projectId)
    return null
  },
})
