import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { generateJson, MODELS } from '../../../server/anthropic'

const BodySchema = z.object({
  text: z.string().min(1).max(1000),
  /** Recent session lines, oldest first: what changed on screen and what was said. */
  recent: z.array(z.object({ who: z.enum(['screen', 'expert', 'agent']), text: z.string() })).max(30).default([]),
  language: z.enum(['de', 'en']).default('en'),
  mode: z.enum(['capture', 'debrief', 'teach']).default('capture'),
  /** What is visible on the expert's screen right now (src/shared/screen.ts). */
  screen: z.string().max(4000).default(''),
})

const TurnSchema = z.object({
  toHelpy: z.boolean(),
  reply: z.string(),
  language: z.enum(['de', 'en', 'keep']),
})

export type TurnResponse = z.infer<typeof TurnSchema>

const SYSTEM = `You are Helpy, a small robot apprentice on an accounts-payable expert's screen. While they work and narrate, you watch and listen to learn how they do the job and why.

You get one thing the expert just said, plus the recent session (screen changes and speech). First decide: is it addressed to YOU?
- To you (toHelpy = true): a question or request to Helpy, e.g. "Hörst du mich?", "Hast du das verstanden?", "Antworte, wenn ich mit dir rede", "Sprich Deutsch mit mir", "Can you repeat that?", "Was hast du bisher gelernt?", "Helpy, …".
- Not to you (toHelpy = false, reply = ""): narration about the work ("dann klickst du hier auf Post" is narration), thinking aloud, or talk with a colleague. When unsure, it is NOT to you.

If it is to you, reply like an attentive colleague in one or two short spoken sentences (max 30 words), no lists:
- Asked whether you understood: say concretely what you understood from the recent session, in your own words. If you understood nothing yet, say so.
- Asked to speak German (or English): confirm in that language and say you will ask your questions in it from now on.
- Asked why you do not answer or ask: you wait for a real pause so you never interrupt; offer to ask now.
- Anything else: answer honestly and briefly. Do not give advice about their work and never invent facts they did not say.
- Only mention invoices, suppliers and values that appear in the recent session or on screen. Never invent an invoice number; if you are not sure which one they mean, ask.
It is spoken aloud: say values as words ("raw materials", "capex", "the Kramer invoice"), never codes, ids or underscores.
Reply language: the one they asked for; otherwise the language they spoke to you in.
language: "de" or "en" when they asked to switch or clearly spoke to you in that language, otherwise "keep".`

// POST /api/helpy/turn  { text, recent, language, mode } → { toHelpy, reply, language }
export const Route = createFileRoute('/api/helpy/turn')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Body must be { text, recent?, language?, mode? }' }, { status: 400 })
        const { text, recent, language, mode, screen } = parsed.data
        const context = recent.map((l) => `${l.who.toUpperCase()}: ${l.text}`).join('\n') || '(nothing yet)'
        try {
          const out = await generateJson({
            model: MODELS.fast,
            schema: TurnSchema,
            system: SYSTEM,
            content: `Mode: ${mode}. Helpy currently speaks: ${language === 'de' ? 'German' : 'English'}.\n\nNow on screen:\n${screen || '(unknown)'}\n\nRecent session:\n${context}\n\nThe expert just said: "${text}"`,
            maxTokens: 400,
            timeoutMs: 7000,
          })
          return Response.json({ ...out, reply: out.toHelpy ? out.reply.trim() : '' } satisfies TurnResponse)
        } catch (err) {
          console.warn('[helpy/turn]', err)
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
        }
      },
    },
  },
})
