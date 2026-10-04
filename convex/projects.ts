import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { deleteTask } from './taskCleanup'

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
  args: { name: v.string(), createdBy: v.optional(v.string()) },
  returns: v.id('projects'),
  handler: async (ctx, { name, createdBy }) => {
    const trimmedName = name.trim()
    if (!trimmedName) throw new ConvexError('Project name is required.')
    return ctx.db.insert('projects', { name: trimmedName, ...(createdBy ? { createdBy } : {}) })
  },
})

/** Helpy names a recording from the expert's spoken answer ("What are you going to show me?"). */
export const rename = mutation({
  args: { projectId: v.id('projects'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { projectId, name }) => {
    const trimmedName = name.trim()
    if (!trimmedName) throw new ConvexError('Project name is required.')
    if (!await ctx.db.get('projects', projectId)) throw new ConvexError('Project not found.')
    await ctx.db.patch('projects', projectId, { name: trimmedName })
    return null
  },
})

export const remove = mutation({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, { projectId }) => {
    const tasks = await ctx.db.query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', projectId)).collect()
    if (tasks.some((task) => !task.completion || task.processing?.kind === 'processing')) throw new ConvexError('Finish recording and processing all tasks before deleting this project.')
    for (const task of tasks) await deleteTask(ctx, task._id)
    await ctx.db.delete('projects', projectId)
    return null
  },
})
