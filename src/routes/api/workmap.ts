import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildWorkMap, LogLineSchema } from '../../server/debrief'

const BodySchema = z.object({
  sessionId: z.string().min(1),
  log: z.array(LogLineSchema).min(1),
  expert: z.string().default('Sabine'),
})

// POST /api/workmap  { sessionId, log, expert? } → { workMap: WorkMap, warnings: string[] }
export const Route = createFileRoute('/api/workmap')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Body must be { sessionId, log: LogLine[] }' }, { status: 400 })
        try {
          return Response.json(await buildWorkMap(parsed.data.sessionId, parsed.data.log, parsed.data.expert))
        } catch (err) {
          console.error('[workmap]', err)
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
        }
      },
    },
  },
})
