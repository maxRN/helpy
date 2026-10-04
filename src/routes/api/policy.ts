import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import type { PolicyRequest, PolicyResponse, QuestionKind } from '../../agent/types';
import { generateJson, MODELS } from '../../server/anthropic';

const KINDS: QuestionKind[] = ['why', 'guardrail', 'exception'];

const SYSTEM = `You choose the single best question an apprentice should ask an accounts-payable expert right now, or decide to stay quiet.

Priorities, highest first:
1. Decisions that deviate from the default: re-coded, held, extra approval, escalated, rejected.
2. Anything on screen that the transcript has NOT explained.
3. Everything else.

Rules:
- Never ask what the expert's narration already explained (see transcriptTail).
- Never repeat or rephrase a question in history.
- The question must be about something in the screen events. Max 15 words. Spoken style, no preamble, one question only.
- Sound like a curious colleague pointing at the concrete moment, e.g. "You moved that one to capex. What made you do that?" or "You held the Kramer invoice. Why that one?"
- Use words, not codes: "capex", "the cost center", "the Kramer invoice", never "0400", "SUP-1007" or event ids. It will be spoken aloud.
- kind: "why" = reason for a decision; "guardrail" = a limit, a rule, or when they would stop and ask someone; "exception" = when the default does not apply.
- If budget.forceGuardrail is true, kind MUST be "guardrail".
- eventId: the id of the screen event the question is about.
- If nothing is worth asking now, set ask to false, leave question and eventId empty, and give the reason.`;

const PolicySchema = z.object({
  ask: z.boolean(),
  question: z.string(),
  eventId: z.string(),
  kind: z.enum(['why', 'guardrail', 'exception']),
  reason: z.string(),
});

const decline = (reason: string) => Response.json({ ask: false, reason } satisfies PolicyResponse);

// POST /api/policy  PolicyRequest -> PolicyResponse
export const Route = createFileRoute('/api/policy')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as PolicyRequest | null;
        if (!body?.events?.length) return decline('no events');

        try {
          // Low effort and a hard timeout: the question is only useful while the pause lasts.
          const parsed = await generateJson({
            model: process.env.POLICY_MODEL ?? MODELS.policy,
            schema: PolicySchema,
            system: SYSTEM,
            content: JSON.stringify(body),
            maxTokens: 1000,
            effort: 'low',
            timeoutMs: 8000,
          });

          const question = parsed.question.trim();
          if (!parsed.ask || !question) return decline(parsed.reason || 'model declined');

          const ids = new Set(body.events.map((e) => e.id));
          const out: PolicyResponse = {
            ask: true,
            question,
            eventId: ids.has(parsed.eventId) ? parsed.eventId : body.events[body.events.length - 1].id,
            kind: KINDS.includes(parsed.kind) ? parsed.kind : 'why',
            reason: parsed.reason,
          };

          // Hard requirement: at least one guardrail question. Enforce it even if the model drifts.
          if (body.budget?.forceGuardrail && out.kind !== 'guardrail') {
            out.kind = 'guardrail';
            out.question = 'Is there a limit on this step?';
          }
          if (out.question!.split(/\s+/).length > 20) console.warn('[policy] long question:', out.question);

          return Response.json(out);
        } catch (err) {
          console.warn('[policy] failed', err);
          return decline('policy error');
        }
      },
    },
  },
});
