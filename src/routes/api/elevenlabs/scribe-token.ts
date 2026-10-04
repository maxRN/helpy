import { createFileRoute } from '@tanstack/react-router'

// GET /api/elevenlabs/scribe-token → { token }
// Single-use token for Scribe v2 Realtime, so the API key never reaches the browser. Expires after 15 minutes.
export const Route = createFileRoute('/api/elevenlabs/scribe-token')({
  server: {
    handlers: {
      GET: async () => {
        const apiKey = process.env.ELEVENLABS_API_KEY
        if (!apiKey) return Response.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 })
        const res = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
          method: 'POST',
          headers: { 'xi-api-key': apiKey },
        })
        if (!res.ok) {
          const detail = await res.text().catch(() => '')
          return Response.json({ error: `ElevenLabs token request failed (${res.status}) ${detail.slice(0, 200)}` }, { status: 502 })
        }
        const { token } = (await res.json()) as { token?: string }
        if (!token) return Response.json({ error: 'ElevenLabs returned no token' }, { status: 502 })
        return Response.json({ token })
      },
    },
  },
})
