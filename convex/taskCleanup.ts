import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

export async function deleteTask(ctx: MutationCtx, taskId: Id<'tasks'>) {
  const task = await ctx.db.get('tasks', taskId)
  if (task?.audioStorageId) await ctx.storage.delete(task.audioStorageId)
  const screenshots = await ctx.db.query('screenshots')
    .withIndex('by_task', (q) => q.eq('taskId', taskId)).collect()
  for (const screenshot of screenshots) {
    await ctx.storage.delete(screenshot.storageId)
    if (screenshot.redactedStorageId) await ctx.storage.delete(screenshot.redactedStorageId)
    await ctx.db.delete('screenshots', screenshot._id)
  }
  await ctx.db.delete('tasks', taskId)
}
