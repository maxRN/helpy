// data-target ids of ERP elements. Plain module, safe to import on the server.

export type EditableField = 'category' | 'costCenter' | 'assetNumber' | 'approver'
export type ErpAction = 'hold' | 'request_approval' | 'post'

export const fieldTarget = (field: EditableField) => `field-${field}`
export const actionTarget = (action: ErpAction) => `action-${action}`
export const rowTarget = (invoiceId: string) => `row-${invoiceId}`
export const PREVIEW_TARGET = 'invoice-preview'
