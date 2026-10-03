import { ConvexError, v } from 'convex/values'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { ALL_INVOICES } from '../src/erp/seed'
import { invoiceChanges } from './invoiceValidators'

const seedDocs = () => ALL_INVOICES.map(({ id, ...rest }) => ({ invoiceId: id, ...rest }))

async function insertSeed(ctx: MutationCtx) {
  for (const doc of seedDocs()) await ctx.db.insert('invoices', doc)
}

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query('invoices').collect(),
})

/** Seeds the demo ledger once. Safe to call from every client on load. */
export const ensureSeeded = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    if (await ctx.db.query('invoices').first()) return false
    await insertSeed(ctx)
    return true
  },
})

/** "Reset demo": back to the seed invoices. Work Maps and events are kept. */
export const reset = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const doc of await ctx.db.query('invoices').collect()) await ctx.db.delete('invoices', doc._id)
    await insertSeed(ctx)
    return null
  },
})

export const patch = mutation({
  args: { invoiceId: v.string(), changes: invoiceChanges },
  returns: v.null(),
  handler: async (ctx, { invoiceId, changes }) => {
    const doc = await ctx.db
      .query('invoices')
      .withIndex('by_invoiceId', (q) => q.eq('invoiceId', invoiceId))
      .unique()
    if (!doc) throw new ConvexError(`Invoice ${invoiceId} not found.`)
    await ctx.db.patch('invoices', doc._id, changes)
    return null
  },
})
