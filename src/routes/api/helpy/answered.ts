import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { generateJson, MODELS } from '../../../server/anthropic'

const BodySchema = z.object({
  /** The question Helpy is holding back (raised hand) until the next pause. */
  question: z.string().min(1).max(600),
  /** What was said lately, oldest first. */
  transcriptTail: z.array(z.object({ speaker: z.string(), text: z.string() })).max(30).default([]),
  /** Screen events around the decision, oldest first (ms since the recording started). */
  events: z.array(z.object({ t: z.number(), text: z.string() })).max(30).default([]),
  language: z.enum(['de', 'en']).default('en'),
})

const VerdictSchema = z.object({ answered: z.boolean(), reason: z.string() })

const SYSTEM = `An apprentice watches an accounts-payable expert work and holds one question back until the expert pauses. Meanwhile the expert keeps narrating (often in German) and working. Decide whether asking the question would now be redundant.

answered = true when the transcript or the screen events already give what the question asks for:
- a "why" question: the expert said the reason for that decision (e.g. "Equipment über 5000 ist immer Capex" answers "Why did you move it to capex?");
- a limit or rule question: the expert named the limit, the rule, or when they stop and ask someone;
- an exception question: the expert said when it is different;
- or the expert just did what the question asks about, so the answer is visible on screen.
answered = false when the reason is still missing, only the action was described without the why ("ich buche das jetzt auf Capex"), or the narration is about something else. Partial hints that leave the actual question open are not an answer. When unsure, false.

reason: one short sentence, quoting the words that answered it when true.`

// POST /api/helpy/answered  { question, transcriptTail, events, language } → { answered, reason }
export const Route = createFileRoute('/api/helpy/answered')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Body must be { question, transcriptTail?, events? }' }, { status: 400 })
        const { question, transcriptTail, events } = parsed.data
        const said = transcriptTail.map((l) => `${l.speaker.toUpperCase()}: ${l.text}`).join('\n') || '(nothing)'
        const screen = events.map((e) => `[${Math.round(e.t / 1000)}s] ${e.text}`).join('\n') || '(nothing)'
        try {
          const out = await generateJson({
            model: MODELS.fast,
            schema: VerdictSchema,
            system: SYSTEM,
            content: `Held question: "${question}"\n\nScreen events:\n${screen}\n\nRecent transcript:\n${said}`,
            maxTokens: 300,
            timeoutMs: 5000,
          })
          return Response.json(out)
        } catch (err) {
          console.warn('[helpy/answered]', err)
          return Response.json({ answered: false, reason: 'check failed' })
        }
      },
    },
  },
})
