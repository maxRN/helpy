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
    const tasks = await ctx.db.query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', projectId)).collect()
    for (const task of tasks) {
      const screenshots = await ctx.db.query('screenshots')
        .withIndex('by_task', (q) => q.eq('taskId', task._id)).collect()
      for (const screenshot of screenshots) {
        await ctx.storage.delete(screenshot.storageId)
        await ctx.db.delete('screenshots', screenshot._id)
      }
      await ctx.db.delete('tasks', task._id)
    }
    await ctx.db.delete('projects', projectId)
    return null
  },
})
