import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { deleteTask } from './taskCleanup'
import { screenshotAnnotation } from './ocrValidators'
import { ocrResultSchema } from '../src/capture/ocr-contract'

export const list = query({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const id = ctx.db.normalizeId('projects', projectId)
    if (!id) return []
    return ctx.db.query('tasks').withIndex('by_project', (q) => q.eq('projectId', id))
      .order('desc').collect()
  },
})

export const get = query({
  args: { projectId: v.string(), taskId: v.string() },
  handler: async (ctx, { projectId, taskId }) => {
    const id = ctx.db.normalizeId('tasks', taskId)
    const task = id ? await ctx.db.get('tasks', id) : null
    if (!task || task.projectId !== projectId) return null
    const project = await ctx.db.get('projects', task.projectId)
    if (!project) return null
    const screenshots = await ctx.db.query('screenshots')
      .withIndex('by_task', (q) => q.eq('taskId', task._id)).collect()
    return {
      ...task,
      projectName: project.name,
      screenshots: await Promise.all(screenshots.map(async (screenshot) => ({
        ...screenshot,
        url: await ctx.storage.getUrl(screenshot.storageId),
      }))),
    }
  },
})

export const create = mutation({
  args: { projectId: v.id('projects'), startedAt: v.number(), recordedBy: v.optional(v.string()) },
  returns: v.id('tasks'),
  handler: async (ctx, { projectId, startedAt, recordedBy }) => {
    if (!await ctx.db.get('projects', projectId)) throw new ConvexError('Project not found.')
    if (!Number.isFinite(startedAt) || startedAt < 0) throw new ConvexError('Invalid start time.')
    return ctx.db.insert('tasks', { projectId, startedAt, completion: null, ...(recordedBy ? { recordedBy } : {}) })
  },
})

export const remove = mutation({
  args: { taskId: v.id('tasks') },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task) throw new ConvexError('Task not found.')
    if (!task.completion) throw new ConvexError('Finish this task before deleting it.')
    await deleteTask(ctx, taskId)
    return null
  },
})

export const generateUploadUrl = mutation({
  args: { taskId: v.id('tasks') },
  returns: v.string(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task || task.completion) throw new ConvexError('This task is not recording.')
    return ctx.storage.generateUploadUrl()
  },
})

export const addScreenshot = mutation({
  args: {
    taskId: v.id('tasks'),
    storageId: v.string(),
    capturedAt: v.number(),
    offsetMs: v.number(),
  },
  returns: v.id('screenshots'),
  handler: async (ctx, { taskId, storageId: rawStorageId, capturedAt, offsetMs }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task || task.completion) throw new ConvexError('This task is not recording.')
    if (!Number.isFinite(offsetMs) || offsetMs < 0 || !Number.isFinite(capturedAt) || capturedAt < 0) {
      throw new ConvexError('Invalid screenshot timestamp.')
    }
    const storageId = ctx.db.system.normalizeId('_storage', rawStorageId)
    const file = storageId ? await ctx.db.system.get('_storage', storageId) : null
    if (!storageId || !file || file.contentType !== 'image/jpeg') {
      throw new ConvexError('A JPEG screenshot is required.')
    }
    return ctx.db.insert('screenshots', { taskId, storageId, capturedAt, offsetMs, ocr: { kind: 'pending' } })
  },
})

export const annotateScreenshot = mutation({
  args: { screenshotId: v.id('screenshots'), ocr: screenshotAnnotation },
  returns: v.null(),
  handler: async (ctx, { screenshotId, ocr }) => {
    const screenshot = await ctx.db.get('screenshots', screenshotId)
    if (!screenshot) throw new ConvexError('Screenshot not found.')
    if (ocr.kind === 'completed') {
      const parsed = ocrResultSchema.safeParse(ocr.result)
      if (!parsed.success) throw new ConvexError('Invalid screenshot text or positions.')
    }
    await ctx.db.patch('screenshots', screenshotId, { ocr })
    return null
  },
})

export const finish = mutation({
  args: {
    taskId: v.id('tasks'),
    durationMs: v.number(),
    error: v.union(v.null(), v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, durationMs, error }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task) throw new ConvexError('Task not found.')
    if (task.completion) return null
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new ConvexError('Invalid task duration.')
    const lastScreenshot = await ctx.db.query('screenshots')
      .withIndex('by_task', (q) => q.eq('taskId', taskId)).order('desc').first()
    if (lastScreenshot && durationMs < lastScreenshot.offsetMs) {
      throw new ConvexError('Task duration cannot end before its last screenshot.')
    }
    await ctx.db.patch('tasks', taskId, { completion: { durationMs, error } })
    return null
  },
})
