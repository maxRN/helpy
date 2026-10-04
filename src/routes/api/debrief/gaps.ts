import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AskedGapSchema, findGaps, LogLineSchema } from '../../../server/debrief'

const BodySchema = z.object({ log: z.array(LogLineSchema).min(1), asked: z.union([z.array(AskedGapSchema), z.number().int().min(0)]).default([]) })

// POST /api/debrief/gaps  { log, asked: { question, answered }[] } → { gaps: Gap[], done, doneReason, required, live }
export const Route = createFileRoute('/api/debrief/gaps')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Body must be { log: LogLine[], asked: { question, answered }[] }' }, { status: 400 })
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
