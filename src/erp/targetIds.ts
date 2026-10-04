// data-target ids of ERP elements. Plain module, safe to import on the server.

export type EditableField = 'category' | 'costCenter' | 'assetNumber' | 'approver'
export type ErpAction = 'hold' | 'request_approval' | 'post'

export const fieldTarget = (field: EditableField) => `field-${field}`
export const actionTarget = (action: ErpAction) => `action-${action}`
export const rowTarget = (invoiceId: string) => `row-${invoiceId}`
export const PREVIEW_TARGET = 'invoice-preview'
export const VENDOR_TARGET = 'vendor-status'
/** ProcureFlow's icon on the mock desktop: where Helpy points when the app still has to be opened. */
export const DESKTOP_APP_TARGET = 'desktop-procureflow'
