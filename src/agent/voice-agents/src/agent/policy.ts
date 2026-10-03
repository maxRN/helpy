import { emit, getDeps, nowRel } from './deps';
import { isPause, logPause, type PauseInputs, type PauseResult } from './pause';
import {
  SCREEN_EVENT_TYPES,
  type AppEvent,
  type PolicyRequest,
  type PolicyResponse,
  type QaRecord,
  type Quote,
  type Speaker,
} from './types';

// "Ask less, later": 3-5 live questions per ten minutes, the rest waits for the debrief.
export const POLICY_LIMITS = {
  maxQuestions: 5,
  minGapMs: 90_000,
  guardrailByQuestion: 2, // if none of the first 2 was a guardrail question, the 3rd must be
} as const;

const MAX_PENDING = 40;
const FALLBACK_GUARDRAIL = ['Is there a limit on this step?', 'When would you stop and ask someone?'];

export interface PolicyOpts {
  getInputs(): PauseInputs;
  tail(n: number): { speaker: Speaker; text: string }[];
  /** Send "[ASK] ..." to the agent. */
  deliver(question: string): void;
  /** Tell the transcript to treat the next expert turn as the answer. */
  noteQuestion(q: { questionEventId: string; eventId?: string }): void;
  endpoint?: string; // default /api/policy
}

export function createQuestionPolicy(o: PolicyOpts) {
  const deps = getDeps();
  const endpoint = o.endpoint ?? '/api/policy';

  let pending: AppEvent[] = []; // screen events not yet covered by a question
  const history: QaRecord[] = [];
  let asked = 0;
  let lastAskedAt = 0;
  let inFlight = false;
  let lastEvaluated: string | null = null; // newest event id we already evaluated and declined

  const off = deps.bus.on('*', (e) => {
    if (!SCREEN_EVENT_TYPES.has(e.type) || !e.text) return;
    if (o.getInputs().offRecord) return;
    pending.push(e);
    if (pending.length > MAX_PENDING) pending.shift();
  });

  const note = (why: string) => logPause({ t: nowRel(), pause: true, blockers: [], note: `skipped: ${why}` });
  const hasGuardrail = () => history.some((h) => h.kind === 'guardrail');

  async function fetchPolicy(req: PolicyRequest): Promise<PolicyResponse> {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) throw new Error(`policy ${res.status}`);
      return (await res.json()) as PolicyResponse;
    } catch (err) {
      console.warn('[policy] request failed', err);
      if (req.budget.forceGuardrail) {
        const last = req.events[req.events.length - 1];
        return {
          ask: true,
          question: FALLBACK_GUARDRAIL[asked % FALLBACK_GUARDRAIL.length],
          eventId: last?.id,
          kind: 'guardrail',
          reason: 'fallback',
        };
      }
      return { ask: false, reason: 'policy unavailable' };
    }
  }

  /** Called by the pause loop. Safe to call repeatedly. */
  async function onPause(_r: PauseResult): Promise<void> {
    if (inFlight) return;
    const now = Date.now();
    if (asked >= POLICY_LIMITS.maxQuestions) return note('question budget used');
    if (asked > 0 && now - lastAskedAt < POLICY_LIMITS.minGapMs) return note('too soon after last question');
    if (!pending.length) return note('no unexplained screen events');
    const newest = pending[pending.length - 1].id;
    if (newest === lastEvaluated) return; // nothing new since the last "no"

    inFlight = true;
    try {
      const force = asked >= POLICY_LIMITS.guardrailByQuestion && !hasGuardrail();
      const req: PolicyRequest = {
        events: pending.map((e) => ({ id: e.id, t: e.t, text: e.text as string })),
        history,
        transcriptTail: o.tail(8),
        budget: { questionsLeft: POLICY_LIMITS.maxQuestions - asked, forceGuardrail: force },
      };
      const res = await fetchPolicy(req);

      if (!res.ask || !res.question) {
        lastEvaluated = newest;
        return note(`model declined (${res.reason ?? 'no reason'})`);
      }
      // The expert may have started typing/talking while we waited for the model.
      if (!isPause(o.getInputs()).pause) {
        lastEvaluated = null;
        return note('pause ended before the question was ready');
      }

      const kind = res.kind ?? (force ? 'guardrail' : 'why');
      const qe = emit({
        type: 'question_asked',
        speaker: 'agent',
        text: res.question,
        meta: { eventId: res.eventId, kind, phase: 'capture' },
      });
      history.push({ question: res.question, kind, eventId: res.eventId, t: qe.t });
      asked += 1;
      lastAskedAt = Date.now();
      pending = [];
      lastEvaluated = null;

      deps.mascot.setState('speaking');
      deps.mascot.bubble(res.question);
      o.noteQuestion({ questionEventId: qe.id, eventId: res.eventId });
      o.deliver(res.question);
      logPause({ t: qe.t, pause: true, blockers: [], note: `asked (${kind}): ${res.question}` });
    } finally {
      inFlight = false;
    }
  }

  /** Attach the expert's answer to the latest question (for the next policy call). */
  function recordAnswer(q: Quote): void {
    const last = history[history.length - 1];
    if (last && !last.answer) last.answer = q.text;
  }

  return {
    onPause,
    recordAnswer,
    stats: () => ({ asked, hasGuardrail: hasGuardrail(), history: [...history] }),
    dispose: () => off(),
  };
}

export type QuestionPolicy = ReturnType<typeof createQuestionPolicy>;
