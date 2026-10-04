import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { deleteTask } from './taskCleanup'
import { screenshotProcessing } from './ocrValidators'
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
      audioUrl: task.audioStorageId ? await ctx.storage.getUrl(task.audioStorageId) : null,
      screenshots: await Promise.all(screenshots.map(async (screenshot) => ({
        ...screenshot,
        url: screenshot.storageId ? await ctx.storage.getUrl(screenshot.storageId) : null,
        redactedUrl: screenshot.redactedStorageId ? await ctx.storage.getUrl(screenshot.redactedStorageId) : null,
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
    if (!task.completion || task.processing?.kind === 'processing') throw new ConvexError('Finish processing this task before deleting it.')
    await deleteTask(ctx, taskId)
    return null
  },
})

export const generateUploadUrl = mutation({
  args: { taskId: v.id('tasks') },
  returns: v.string(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task || (task.completion && (!task.processing || task.processing.kind === 'completed'))) throw new ConvexError('This task is not accepting uploads.')
    return ctx.storage.generateUploadUrl()
  },
})

export const addScreenshot = mutation({
  args: { taskId: v.id('tasks'), capturedAt: v.number(), offsetMs: v.number() },
  returns: v.id('screenshots'),
  handler: async (ctx, { taskId, capturedAt, offsetMs }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task || (task.completion && (!task.processing || task.processing.kind === 'completed'))) throw new ConvexError('This task is not accepting screenshots.')
    if (!Number.isFinite(offsetMs) || offsetMs < 0 || !Number.isFinite(capturedAt) || capturedAt < 0 || (task.completion && offsetMs > task.completion.durationMs)) {
      throw new ConvexError('Invalid screenshot timestamp.')
    }
    const existing = await ctx.db.query('screenshots').withIndex('by_task', (q) => q.eq('taskId', taskId).eq('offsetMs', offsetMs)).unique()
    return existing?._id ?? ctx.db.insert('screenshots', { taskId, capturedAt, offsetMs, ocr: { kind: 'pending' } })
  },
})

export const updateScreenshot = mutation({
  args: { screenshotId: v.id('screenshots'), storageId: v.optional(v.string()), processing: screenshotProcessing },
  returns: v.null(),
  handler: async (ctx, { screenshotId, storageId: rawStorageId, processing }) => {
    const screenshot = await ctx.db.get('screenshots', screenshotId)
    if (!screenshot) throw new ConvexError('Screenshot not found.')
    const task = await ctx.db.get('tasks', screenshot.taskId)
    if (!task || (task.completion && (!task.processing || task.processing.kind === 'completed'))) throw new ConvexError('This task is not accepting screenshots.')
    const storageId = rawStorageId === undefined ? screenshot.storageId : ctx.db.system.normalizeId('_storage', rawStorageId)
    if (rawStorageId !== undefined || processing.kind === 'completed') {
      const file = storageId ? await ctx.db.system.get('_storage', storageId) : null
      if (!storageId || !file || file.contentType !== 'image/jpeg') throw new ConvexError('A JPEG screenshot is required.')
    }
    if (processing.kind !== 'completed') {
      await ctx.db.patch('screenshots', screenshotId, { ...(storageId ? { storageId } : {}), ocr: processing })
      return null
    }
    const { result, redaction } = processing
    const redactedStorageId = ctx.db.system.normalizeId('_storage', processing.redactedStorageId)
    const redactedFile = redactedStorageId ? await ctx.db.system.get('_storage', redactedStorageId) : null
    if (!redactedStorageId || !redactedFile || !['image/png', 'image/jpeg'].includes(redactedFile.contentType ?? '')) {
      throw new ConvexError('A redacted screenshot is required.')
    }
    const parsed = ocrResultSchema.safeParse(result)
    if (!parsed.success) throw new ConvexError('Invalid screenshot text or positions.')
    for (const box of redaction.boxes) {
      if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) || box.x0 < 0 || box.y0 < 0 || box.x0 >= box.x1 || box.y0 >= box.y1 || box.x1 > result.width || box.y1 > result.height) {
        throw new ConvexError('Invalid redaction coordinates.')
      }
    }
    const text = parsed.data.text
    for (const span of redaction.spans) {
      if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.start >= span.end || span.end > text.length) throw new ConvexError('Invalid PII text offsets.')
    }
    if (Object.values(redaction.timings).some((ms) => !Number.isFinite(ms) || ms < 0)) throw new ConvexError('Invalid pipeline timings.')
    if (!storageId) throw new ConvexError('A JPEG screenshot is required.')
    await ctx.db.patch('screenshots', screenshotId, { storageId, redactedStorageId, redaction, ocr: { kind: 'completed', result } })
    return null
  },
})

export const finish = mutation({
  args: {
    taskId: v.id('tasks'),
    durationMs: v.number(),
    error: v.union(v.null(), v.string()),
    processing: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, durationMs, error, processing }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task) throw new ConvexError('Task not found.')
    if (task.completion) return null
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new ConvexError('Invalid task duration.')
    const lastScreenshot = await ctx.db.query('screenshots')
      .withIndex('by_task', (q) => q.eq('taskId', taskId)).order('desc').first()
    if (lastScreenshot && durationMs < lastScreenshot.offsetMs) {
      throw new ConvexError('Task duration cannot end before its last screenshot.')
    }
    if (!processing) {
      const screenshots = await ctx.db.query('screenshots').withIndex('by_task', (q) => q.eq('taskId', taskId)).collect()
      for (const screenshot of screenshots) {
        if (screenshot.ocr?.kind === 'pending') await ctx.db.patch('screenshots', screenshot._id, { ocr: { kind: 'failed', error: 'Screenshot processing was interrupted.' } })
      }
    }
    await ctx.db.patch('tasks', taskId, { completion: { durationMs, error }, ...(processing ? { processing: { kind: 'processing' as const } } : {}) })
    return null
  },
})

export const completeProcessing = mutation({
  args: { taskId: v.id('tasks'), error: v.union(v.null(), v.string()), audioStorageId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { taskId, error, audioStorageId: rawAudioStorageId }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task?.completion) throw new ConvexError('Finish the recording before completing processing.')
    const screenshots = await ctx.db.query('screenshots').withIndex('by_task', (q) => q.eq('taskId', taskId)).collect()
    if (screenshots.some((shot) => shot.ocr?.kind === 'pending')) throw new ConvexError('Screenshots are still processing.')
    const audioStorageId = rawAudioStorageId === undefined ? undefined : ctx.db.system.normalizeId('_storage', rawAudioStorageId)
    if (audioStorageId !== undefined) {
      const file = audioStorageId ? await ctx.db.system.get('_storage', audioStorageId) : null
      if (!audioStorageId || !file?.size || !['audio/webm', 'audio/mp4', 'audio/ogg'].includes(file.contentType?.split(';')[0] ?? '')) {
        throw new ConvexError('A microphone audio recording is required.')
      }
    }
    await ctx.db.patch('tasks', taskId, {
      processing: error ? { kind: 'failed', error } : screenshots.some((shot) => shot.ocr?.kind === 'failed')
        ? { kind: 'failed', error: 'Some screenshots could not be processed or uploaded.' } : { kind: 'completed' },
      ...(audioStorageId ? { audioStorageId } : {}),
    })
    return null
  },
})

export const failProcessing = mutation({
  args: { taskId: v.id('tasks'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { taskId, error }) => {
    const task = await ctx.db.get('tasks', taskId)
    if (!task?.completion) throw new ConvexError('Finish the recording before reporting a processing failure.')
    await ctx.db.patch('tasks', taskId, { processing: { kind: 'failed', error } })
    return null
  },
})
