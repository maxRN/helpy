import { createFileRoute } from '@tanstack/react-router';
import type { PolicyRequest, PolicyResponse, QuestionKind } from '../../agent/types';

const KINDS: QuestionKind[] = ['why', 'guardrail', 'exception'];

const SYSTEM = `You choose the single best question an apprentice should ask an accounts-payable expert right now, or decide to stay quiet.

Priorities, highest first:
1. Decisions that deviate from the default: re-coded, held, extra approval, escalated, rejected.
2. Anything on screen that the transcript has NOT explained.
3. Everything else.

Rules:
- Never ask what the expert's narration already explained (see transcriptTail).
- Never repeat or rephrase a question in history.
- The question must be about something in the screen events. Max 15 words. Spoken style, no preamble.
- kind: "why" = reason for a decision; "guardrail" = a limit, a rule, or when they would stop and ask someone; "exception" = when the default does not apply.
- If budget.forceGuardrail is true, kind MUST be "guardrail".
- If nothing is worth asking now, return {"ask": false, "reason": "..."}.

Reply with ONLY a JSON object:
{"ask": boolean, "question": string, "eventId": string, "kind": "why"|"guardrail"|"exception", "reason": string}`;

const decline = (reason: string) => Response.json({ ask: false, reason } satisfies PolicyResponse);

// POST /api/policy  PolicyRequest -> PolicyResponse
export const Route = createFileRoute('/api/policy')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as PolicyRequest;
        if (!body?.events?.length) return decline('no events');

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });

        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 8000);

        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
              model: process.env.POLICY_MODEL ?? 'claude-sonnet-5-5',
              max_tokens: 300,
              temperature: 0.2,
              system: SYSTEM,
              messages: [{ role: 'user', content: JSON.stringify(body) }],
            }),
            signal: ctl.signal,
          });
          if (!res.ok) return Response.json({ error: `anthropic ${res.status}` }, { status: 502 });

          const data = (await res.json()) as { content?: { type: string; text?: string }[] };
          const raw = data.content?.find((c) => c.type === 'text')?.text ?? '';
          const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as Partial<PolicyResponse>;

          const question = String(parsed.question ?? '').trim();
          if (!parsed.ask || !question) return decline(parsed.reason ?? 'model declined');

          const ids = new Set(body.events.map((e) => e.id));
          const out: PolicyResponse = {
            ask: true,
            question,
            eventId: parsed.eventId && ids.has(parsed.eventId) ? parsed.eventId : body.events[body.events.length - 1].id,
            kind: parsed.kind && KINDS.includes(parsed.kind) ? parsed.kind : 'why',
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
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
