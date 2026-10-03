import { v } from 'convex/values'

export const category = v.union(
  v.literal('equipment'),
  v.literal('office'),
  v.literal('services'),
  v.literal('raw_materials'),
  v.literal('software'),
  v.literal('intercompany'),
)
export const account = v.union(v.literal('opex'), v.literal('capex'))
export const status = v.union(v.literal('open'), v.literal('on_hold'), v.literal('awaiting_approval'), v.literal('posted'))

/** Mirrors src/erp/model.ts Invoice, with `id` stored as `invoiceId`. */
export const invoiceFields = {
  invoiceId: v.string(),
  number: v.string(),
  supplierId: v.string(),
  supplierName: v.string(),
  supplierCountry: v.string(),
  supplierAddress: v.string(),
  supplierVerified: v.boolean(),
  invoiceDate: v.string(),
  dueDate: v.string(),
  month: v.number(),
  poNumber: v.string(),
  lines: v.array(v.object({ description: v.string(), qty: v.number(), unitPrice: v.number() })),
  amount: v.number(),
  category,
  costCenter: v.string(),
  account,
  assetNumber: v.string(),
  approver: v.string(),
  approvalRequested: v.boolean(),
  status,
  note: v.string(),
  bankAccount: v.string(),
  contactName: v.string(),
  contactEmail: v.string(),
  teachOnly: v.optional(v.boolean()),
}

/** What the ERP lets a user change on an invoice. */
export const invoiceChanges = v.object({
  category: v.optional(category),
  costCenter: v.optional(v.string()),
  account: v.optional(account),
  assetNumber: v.optional(v.string()),
  approver: v.optional(v.string()),
  approvalRequested: v.optional(v.boolean()),
  status: v.optional(status),
  note: v.optional(v.string()),
})
