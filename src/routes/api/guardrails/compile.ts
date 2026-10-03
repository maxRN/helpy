import '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { compileGuardrails } from '../../../server/compileGuardrails'

const BodySchema = z.object({
  guardrails: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      quote: z.object({ text: z.string(), t: z.number(), speaker: z.enum(['expert', 'trainee', 'agent']) }),
      stepId: z.string().optional(),
      severity: z.enum(['block', 'ask']).optional(),
    }),
  ),
})

// POST /api/guardrails/compile  { guardrails: GuardrailInput[] } → { guardrails: Guardrail[], warnings: string[] }
export const Route = createFileRoute('/api/guardrails/compile')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json({ error: 'Body must be { guardrails: [...] }', issues: parsed.error.issues }, { status: 400 })
        }
        try {
          return Response.json(await compileGuardrails(parsed.data.guardrails))
        } catch (err) {
          console.error('[guardrails/compile]', err)
          const message = err instanceof Error ? err.message : String(err)
          return Response.json({ error: `Compiling guardrails failed: ${message}` }, { status: 502 })
        }
      },
    },
  },
})
