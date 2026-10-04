import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { catalogForPrompt } from '../../erp/catalog'
import { generateJson, jpegBlock, MODELS } from '../../server/anthropic'

const BodySchema = z.object({
  image: z.string().min(100), // base64 JPEG, no data: prefix, already PII-masked by the browser
  previous: z.string().max(4000).default(''),
})

const FrameSchema = z.object({
  description: z.string(),
  events: z.array(
    z.object({
      kind: z.enum(['invoice_opened', 'field_changed', 'action']),
      invoiceId: z.string(),
      text: z.string(),
    }),
  ),
})

export type FrameResponse = z.infer<typeof FrameSchema>

const SYSTEM = `You watch an accounts-payable clerk's screen while they work in the ProcureFlow ERP.
You get the previous screen description and a new screenshot. Report only what CHANGED since the previous description.

- events: one entry per visible change, oldest first. kind is "invoice_opened" (an invoice detail view opened),
  "field_changed" (a coding field got a new value) or "action" (hold, second approval, post, or a status change).
  text: one short sentence, e.g. "Invoice 4471: cost center 4711 → 0400 (capex)". invoiceId: the invoice number exactly as printed, or "" if it is not clearly readable. Never guess or complete a number.
- No events if nothing relevant changed (mouse moves, scrolling, other apps do not count).
- description: two sentences at most about the current screen: which view, which invoice, key field values and status.
- Personal data is replaced with synthetic values such as Alex Morgan, alex@example.com, Example Street, 42 or 00000. Treat those values as redactions, never as invoice numbers, cost centers or amounts, and never infer the original personal data.
- Only report values you can actually read. If something is unclear, leave it out instead of guessing.

${catalogForPrompt()}`

// POST /api/frame  { image, previous } → { description, events }
export const Route = createFileRoute('/api/frame')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Body must be { image: base64 jpeg, previous?: string }' }, { status: 400 })
        try {
          const result = await generateJson({
            model: MODELS.fast,
            schema: FrameSchema,
            system: SYSTEM,
            content: [
              { type: 'text', text: `Previous description: ${parsed.data.previous || '(none, first frame)'}` },
              jpegBlock(parsed.data.image),
            ],
            maxTokens: 1500,
            timeoutMs: 15000,
          })
          return Response.json(result)
        } catch (err) {
          console.error('[frame]', err)
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
        }
      },
    },
  },
})
