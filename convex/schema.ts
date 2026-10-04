import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { invoiceFields } from './invoiceValidators'
import { screenshotOcr } from './ocrValidators'

export default defineSchema({
  // createdBy / recordedBy: the signed-in Helpy user (a display name; the sign-in is a mock).
  projects: defineTable({ name: v.string(), createdBy: v.optional(v.string()) }),

  // ProcureFlow mini ERP: one shared demo ledger, live on every device.
  invoices: defineTable(invoiceFields).index('by_invoiceId', ['invoiceId']),

  // Work Map per capture session (shape: WorkMap in src/shared/types.ts).
  workMaps: defineTable({ sessionId: v.string(), workMap: v.any(), savedAt: v.number() })
    .index('by_sessionId', ['sessionId'])
    .index('by_savedAt', ['savedAt']),

  // AppEvent log per session (shape: AppEvent in src/shared/types.ts).
  events: defineTable({ sessionId: v.string(), event: v.any() }).index('by_sessionId', ['sessionId']),

  tasks: defineTable({
    projectId: v.id('projects'),
    startedAt: v.number(),
    recordedBy: v.optional(v.string()),
    audioStorageId: v.optional(v.id('_storage')),
    completion: v.union(v.null(), v.object({
      durationMs: v.number(),
      error: v.union(v.null(), v.string()),
    })),
  }).index('by_project', ['projectId']),
  screenshots: defineTable({
    taskId: v.id('tasks'),
    storageId: v.id('_storage'),
    capturedAt: v.number(),
    offsetMs: v.number(),
    ocr: v.optional(screenshotOcr),
  }).index('by_task', ['taskId', 'offsetMs']),
})
