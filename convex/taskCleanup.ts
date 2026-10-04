import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

export async function deleteTask(ctx: MutationCtx, taskId: Id<'tasks'>) {
  const task = await ctx.db.get('tasks', taskId)
  const storageIds = new Set<Id<'_storage'>>()
  if (task?.audioStorageId) storageIds.add(task.audioStorageId)
  const screenshots = await ctx.db.query('screenshots')
    .withIndex('by_task', (q) => q.eq('taskId', taskId)).collect()
  for (const screenshot of screenshots) {
    if (screenshot.storageId) storageIds.add(screenshot.storageId)
    if (screenshot.redactedStorageId) storageIds.add(screenshot.redactedStorageId)
    await ctx.db.delete('screenshots', screenshot._id)
  }
  for (const storageId of storageIds) await ctx.storage.delete(storageId)
  // The recording's Work Map is stored under its session id, which is the task id.
  const maps = await ctx.db.query('workMaps').withIndex('by_sessionId', (q) => q.eq('sessionId', taskId)).collect()
  for (const map of maps) await ctx.db.delete('workMaps', map._id)
  await ctx.db.delete('tasks', taskId)
}
