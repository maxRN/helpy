import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { findGaps, LogLineSchema } from '../../../server/debrief'

const BodySchema = z.object({ log: z.array(LogLineSchema).min(1), asked: z.number().int().min(0).default(0) })

// POST /api/debrief/gaps  { log, asked } → { gaps: Gap[], done, doneReason }
export const Route = createFileRoute('/api/debrief/gaps')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Body must be { log: LogLine[], asked: number }' }, { status: 400 })
        try {
          return Response.json(await findGaps(parsed.data.log, parsed.data.asked))
        } catch (err) {
          console.error('[debrief/gaps]', err)
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
        }
      },
    },
  },
})
