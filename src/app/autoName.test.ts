import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConvexReactClient } from 'convex/react'
import { clearEventLog, emitEvent } from '../shared/bus'
import { nameRecording } from './autoName'
import { UNNAMED } from './recordName'

const convexWith = (name: string | null) => {
  const mutation = vi.fn(async () => null)
  const client = { query: vi.fn(async () => (name === null ? null : { name })), mutation } as unknown as ConvexReactClient
  return { client, mutation }
}

beforeEach(() => {
  clearEventLog()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ title: 'Lieferantenrechnungen prüfen und buchen' })))
})

afterEach(() => vi.unstubAllGlobals())

const recordSomething = () => {
  emitEvent({ source: 'vision', kind: 'invoice_opened', text: 'Opened invoice 4471' })
  emitEvent({ source: 'voice', kind: 'utterance', speaker: 'expert', text: 'Equipment über fünftausend ist immer Capex.' })
}

describe('nameRecording', () => {
  it('names a process that still has the placeholder name', async () => {
    recordSomething()
    const { client, mutation } = convexWith(UNNAMED)
    expect(await nameRecording(client, 'p1')).toBe('Lieferantenrechnungen prüfen und buchen')
    expect(mutation).toHaveBeenCalledWith(expect.anything(), { projectId: 'p1', name: 'Lieferantenrechnungen prüfen und buchen' })
  })

  it('never overwrites a name given by hand', async () => {
    recordSomething()
    const { client, mutation } = convexWith('Monatsabschluss Dezember')
    expect(await nameRecording(client, 'p1')).toBeNull()
    expect(mutation).not.toHaveBeenCalled()
  })

  it('leaves an empty recording as it is', async () => {
    const { client, mutation } = convexWith(UNNAMED)
    expect(await nameRecording(client, 'p1')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(mutation).not.toHaveBeenCalled()
  })
})
