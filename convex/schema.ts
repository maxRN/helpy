import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { invoiceFields } from './invoiceValidators'

export default defineSchema({
  projects: defineTable({ name: v.string() }),

  // ProcureFlow mini ERP: one shared demo ledger, live on every device.
  invoices: defineTable(invoiceFields).index('by_invoiceId', ['invoiceId']),

  // Work Map per capture session (shape: WorkMap in src/shared/types.ts).
  workMaps: defineTable({ sessionId: v.string(), workMap: v.any(), savedAt: v.number() })
    .index('by_sessionId', ['sessionId'])
    .index('by_savedAt', ['savedAt']),

  // AppEvent log per session (shape: AppEvent in src/shared/types.ts).
  events: defineTable({ sessionId: v.string(), event: v.any() }).index('by_sessionId', ['sessionId']),
})
