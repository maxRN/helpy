import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { generateJson, MODELS } from '../../../server/anthropic'
import { formatLog, LogLineSchema } from '../../../server/debrief'

const BodySchema = z.object({ log: z.array(LogLineSchema).min(1).max(400) })

const NameSchema = z.object({ title: z.string() })

const SYSTEM = `You name a recorded work task so a colleague recognises it in a list of processes.
You get the session log: what changed on screen and what the expert said while working.

- 2 to 6 words, specific to what was actually done, like a process title: "Lieferantenrechnungen prüfen und buchen", "Supplier invoices: month-end close", "Kostenstellen für Geräterechnungen".
- In the language the expert spoke (German or English).
- Only from what is in the log. Ignore chatter with colleagues, talk about the recording tool and remarks to the apprentice.
- No quotes, no trailing punctuation, no dates, no "Recording" or "Task".`

// POST /api/helpy/name  { log } → { title }: a short name for a finished recording.
export const Route = createFileRoute('/api/helpy/name')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Body must be { log: LogLine[] }' }, { status: 400 })
        try {
          const { title } = await generateJson({
            model: MODELS.policy,
            schema: NameSchema,
            system: SYSTEM,
            content: `Session log:\n${formatLog(parsed.data.log)}`,
            maxTokens: 300,
            effort: 'low',
            timeoutMs: 15000,
          })
          const clean = title.replace(/^["'„“]+|["'“”.!?]+$/g, '').trim().slice(0, 80)
          return clean ? Response.json({ title: clean }) : Response.json({ error: 'empty title' }, { status: 502 })
        } catch (err) {
          console.warn('[helpy/name]', err)
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
        }
      },
    },
  },
})
