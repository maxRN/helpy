import { useMutation, useQuery } from 'convex/react'
import { useEffect } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { bus } from '../shared/bus'
import { keepWhileOffRecord } from '../shared/privacy'
import { session } from '../shared/session'
import type { AppEvent } from '../shared/types'
import type { Invoice } from './model'
import { useErp } from './store'
import { setErpSync } from './sync'

const fromDoc = ({ _id, _creationTime, invoiceId, ...rest }: Doc<'invoices'>): Invoice => ({ id: invoiceId, ...rest })

/**
 * Connects the ERP store to Convex: loads (and seeds) the shared invoices, applies live changes
 * from other devices, writes local changes back, and stores every AppEvent of the session.
 * Renders nothing. Mounted once by ErpApp.
 */
export function ConvexSync() {
  const invoices = useQuery(api.invoices.list)
  const ensureSeeded = useMutation(api.invoices.ensureSeeded)
  const patchInvoice = useMutation(api.invoices.patch)
  const resetInvoices = useMutation(api.invoices.reset)
  const saveWorkMap = useMutation(api.workMaps.save)
  const appendEvent = useMutation(api.events.append)

  useEffect(() => {
    void ensureSeeded()
  }, [ensureSeeded])

  useEffect(() => {
    if (invoices) useErp.getState().replaceFromServer(invoices.map(fromDoc))
  }, [invoices])

  useEffect(() => {
    const report = (what: string) => (err: unknown) => console.error(`[convex] ${what} failed`, err)
    setErpSync({
      patchInvoice: (invoiceId, changes) => void patchInvoice({ invoiceId, changes }).catch(report('patch invoice')),
      resetInvoices: () => void resetInvoices().catch(report('reset invoices')),
      saveWorkMap: (sessionId, workMap) => void saveWorkMap({ sessionId, workMap }).catch(report('save Work Map')),
    })
    return () => setErpSync(null)
  }, [patchInvoice, resetInvoices, saveWorkMap])

  // Every AppEvent of the session goes to the database (P3 can read it server-side).
  useEffect(() => {
    const onEvent = (e: AppEvent) => {
      // Off the record: nothing that happens is stored (only the markers, which hold no content).
      if (!keepWhileOffRecord(e, session().offRecord)) return
      void appendEvent({ sessionId: session().sessionId, event: e }).catch((err) =>
        console.error('[convex] append event failed', err),
      )
    }
    bus.on('event', onEvent)
    return () => bus.off('event', onEvent)
  }, [appendEvent])

  return null
}

/** Latest saved Work Map from any device (undefined while loading, null if none). */
export const useLatestWorkMap = () => useQuery(api.workMaps.latest)
