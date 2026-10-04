import { afterEach, describe, expect, it, vi } from 'vitest'
import { ttsAudio } from './voice'

afterEach(() => vi.unstubAllGlobals())

describe('TTS audio cache', () => {
  it('a prefetched line is fetched once and reused when it is said', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['mp3']) }))
    vi.stubGlobal('fetch', fetchMock)
    const prefetched = ttsAudio('Why did you hold the Kramer invoice?')
    const said = ttsAudio('Why did you hold the Kramer invoice?')
    expect(await said).toBe(await prefetched)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a failed request is not kept, so the next try fetches again', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, blob: async () => new Blob(['mp3']) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await ttsAudio('Back on the record.')).toBeNull()
    await Promise.resolve()
    expect(await ttsAudio('Back on the record.')).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
