import { emit, getDeps, nowRel } from './deps';
import { isPause, logPause, type PauseInputs, type PauseResult } from './pause';
import {
  SCREEN_EVENT_TYPES,
  type AppEvent,
  type PolicyRequest,
  type PolicyResponse,
  type QaRecord,
  type QuestionKind,
  type Quote,
  type Speaker,
} from './types';

// "Ask less, later": a handful of live questions, the rest waits for the debrief.
// A demo recording lasts a few minutes, so the gap between two questions is 30 s, not minutes.
export const POLICY_LIMITS = {
  maxQuestions: 5,
  minGapMs: 30_000,
  guardrailByQuestion: 2, // if none of the first 2 was a guardrail question, the 3rd must be
} as const;

const MAX_PENDING = 40;
const PREPARE_EVERY_MS = 8000;
const FALLBACK_GUARDRAIL = {
  en: ['Is there a limit on this step?', 'When would you stop and ask someone?'],
  de: ['Gibt es bei diesem Schritt eine Grenze?', 'Wann würdest du aufhören und jemanden fragen?'],
};

type ReadyQuestion = { question: string; kind: QuestionKind; eventId?: string };

/** What deliver() gets to say a question at the right moment. */
export interface DeliveryControl {
  /** Is it still a pause? Check right before the voice starts (e.g. after the TTS audio arrived). */
  stillQuiet(): boolean;
  /** Call when the question actually starts being spoken (or shown); the question counts as asked from then on. */
  started(): void;
}

export interface PolicyOpts {
  getInputs(): PauseInputs;
  tail(n: number): { speaker: Speaker; text: string }[];
  /**
   * Say the question (agent "[ASK] ..." or TTS). Resolve false if it was not said because the expert
   * became busy in the meantime: the question is held again and asked at the next pause.
   */
  deliver(question: string, control: DeliveryControl): Promise<boolean> | boolean | void;
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
  let ready: ReadyQuestion | null = null; // prepared while the expert was busy, asked at the next pause
  let delivering: ReadyQuestion | null = null; // being spoken right now: never a second time in parallel

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
          question: FALLBACK_GUARDRAIL[req.language ?? 'en'][asked % 2],
          eventId: last?.id,
          kind: 'guardrail',
          reason: 'fallback',
        };
      }
      return { ask: false, reason: 'policy unavailable' };
    }
  }

  const canAsk = (now: number): string | null => {
    if (asked >= POLICY_LIMITS.maxQuestions) return 'question budget used';
    if (asked > 0 && now - lastAskedAt < POLICY_LIMITS.minGapMs) return 'too soon after last question';
    if (!pending.length) return 'no unexplained screen events';
    return null;
  };

  /** One model call over the pending screen events. null = nothing worth asking. */
  async function think(): Promise<ReadyQuestion | null> {
    const newest = pending[pending.length - 1].id;
    const force = asked >= POLICY_LIMITS.guardrailByQuestion && !hasGuardrail();
    const req: PolicyRequest = {
      // Oldest first by screen time: a vision event can arrive after a newer ERP event.
      events: [...pending].sort((a, b) => a.t - b.t).map((e) => ({ id: e.id, t: e.t, text: e.text as string })),
      history,
      transcriptTail: o.tail(8),
      budget: { questionsLeft: POLICY_LIMITS.maxQuestions - asked, forceGuardrail: force },
      language: deps.language?.() ?? 'en',
      screen: deps.screen?.(),
    };
    const res = await fetchPolicy(req);
    if (!res.ask || !res.question) {
      lastEvaluated = newest;
      note(`model declined (${res.reason ?? 'no reason'})`);
      return null;
    }
    return { question: res.question, kind: res.kind ?? (force ? 'guardrail' : 'why'), eventId: res.eventId };
  }

  /** Hold a question until the next pause; Helpy raises a hand meanwhile. */
  function hold(q: ReadyQuestion): void {
    ready = q;
    deps.mascot.waiting?.(q.question);
    logPause({ t: nowRel(), pause: false, blockers: [], note: `holding (${q.kind}): ${q.question}` });
  }

  /** The question is being said: from now on it counts as asked (once). */
  function commit(q: ReadyQuestion): void {
    deps.mascot.waiting?.(null);
    const qe = emit({
      type: 'question_asked',
      speaker: 'agent',
      text: q.question,
      meta: { eventId: q.eventId, kind: q.kind, phase: 'capture' },
    });
    history.push({ question: q.question, kind: q.kind, eventId: q.eventId, t: qe.t });
    asked += 1;
    lastAskedAt = Date.now();
    pending = [];
    lastEvaluated = null;

    deps.mascot.setState('speaking');
    deps.mascot.bubble(q.question);
    o.noteQuestion({ questionEventId: qe.id, eventId: q.eventId });
    logPause({ t: qe.t, pause: true, blockers: [], note: `asked (${q.kind}): ${q.question}` });
  }

  /**
   * Says a question once. If the expert starts typing or talking before the voice starts, the
   * question is not said and waits for the next pause instead (no talking over anyone).
   */
  async function askNow(q: ReadyQuestion): Promise<void> {
    if (delivering) return;
    delivering = q;
    ready = null;
    let committed = false;
    const started = () => {
      if (committed) return;
      committed = true;
      commit(q);
    };
    let said = true;
    try {
      said = (await o.deliver(q.question, { stillQuiet: () => isPause(o.getInputs()).pause, started })) !== false;
    } catch (err) {
      console.warn('[policy] delivery failed', err);
    } finally {
      delivering = null;
    }
    if (committed) return;
    if (said) return started(); // delivered without reporting the start (e.g. the agent's [ASK])
    if (!ready) hold(q);
    note(`deferred, the expert became busy: ${q.question}`);
  }

  /** Called by the pause loop. Safe to call repeatedly. */
  async function onPause(_r: PauseResult): Promise<void> {
    if (delivering) return;
    if (ready) return askNow(ready);
    if (inFlight) return;
    const why = canAsk(Date.now());
    if (why) return note(why);
    if (pending[pending.length - 1].id === lastEvaluated) return; // nothing new since the last "no"

    inFlight = true;
    try {
      const q = await think();
      if (!q) return;
      // The expert may have started typing/talking while we waited for the model.
      if (!isPause(o.getInputs()).pause) return hold(q);
      inFlight = false;
      await askNow(q);
    } finally {
      inFlight = false;
    }
  }

  // Think ahead while the expert is busy: a question that is ready waits for the next pause, and the
  // raised hand tells the expert there is one, so nobody is interrupted and nobody talks on unaware.
  const prepare = setInterval(() => {
    if (ready || inFlight || delivering) return;
    const inputs = o.getInputs();
    if (inputs.offRecord || isPause(inputs).pause) return; // pauses are handled by onPause
    if (canAsk(inputs.now) || pending[pending.length - 1].id === lastEvaluated) return;
    inFlight = true;
    void think()
      .then((q) => {
        if (q) hold(q);
      })
      .finally(() => {
        inFlight = false;
      });
  }, PREPARE_EVERY_MS);

  /** The expert said "ask me now" (clicked the raised hand). */
  function askReadyNow(): boolean {
    if (!ready || delivering) return false;
    void askNow(ready);
    return true;
  }

  /** Attach the expert's answer to the latest question (for the next policy call). */
  function recordAnswer(q: Quote): void {
    const last = history[history.length - 1];
    if (last && !last.answer) last.answer = q.text;
  }

  return {
    onPause,
    askReadyNow,
    recordAnswer,
    stats: () => ({ asked, hasGuardrail: hasGuardrail(), history: [...history], waiting: ready?.question ?? null }),
    dispose: () => {
      off();
      clearInterval(prepare);
      if (ready) deps.mascot.waiting?.(null);
    },
  };
}

export type QuestionPolicy = ReturnType<typeof createQuestionPolicy>;
