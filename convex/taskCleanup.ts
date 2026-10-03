import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

export async function deleteTask(ctx: MutationCtx, taskId: Id<'tasks'>) {
  const screenshots = await ctx.db.query('screenshots')
    .withIndex('by_task', (q) => q.eq('taskId', taskId)).collect()
  for (const screenshot of screenshots) {
    await ctx.storage.delete(screenshot.storageId)
    await ctx.db.delete('screenshots', screenshot._id)
  }
  await ctx.db.delete('tasks', taskId)
}
