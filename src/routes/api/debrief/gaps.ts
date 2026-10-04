import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { findGaps, LogLineSchema } from '../../../server/debrief'

const BodySchema = z.object({
  log: z.array(LogLineSchema).min(1),
  asked: z.number().int().min(0).default(0),
  /** No guardrail question was asked during the task: the first debrief question must be one. */
  needGuardrail: z.boolean().default(false),
})

// POST /api/debrief/gaps  { log, asked, needGuardrail? } → { gaps: Gap[], done, doneReason }
export const Route = createFileRoute('/api/debrief/gaps')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Body must be { log: LogLine[], asked: number }' }, { status: 400 })
        try {
          return Response.json(await findGaps(parsed.data.log, parsed.data.asked, parsed.data.needGuardrail))
        } catch (err) {
          console.error('[debrief/gaps]', err)
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
        }
      },
    },
  },
})
