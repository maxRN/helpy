import { fallbackQuestion, isDecision, isDuplicateQuestion, unresolvedDecisions } from './coverage';
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
  /** The brief's bar: at least three live questions per task, at least one about a guardrail. */
  minQuestions: 3,
  maxQuestions: 5,
  minGapMs: 30_000,
  guardrailByQuestion: 1, // the brief requires a guardrail question: if the first was not one, the second must be
} as const;

/** After asking, Helpy waits this long for the answer before it may ask something else (a clarification keeps it waiting). */
export const ANSWER_WAIT_MS = 45_000;
/** A held question is checked against new narration and screen events at most this often. */
const ANSWERED_CHECK_DEBOUNCE_MS = 300;
/** At the pause, a check still running for the held question is awaited at most this long. */
const ANSWERED_CHECK_WAIT_MS = 2000;

const MAX_PENDING = 40;
const MAX_SEEN = 200;
/** Wrap-up: how long Helpy waits for a pause, and for the answer, per owed question. */
const WRAP_PAUSE_WAIT_MS = 20_000;
const WRAP_ANSWER_WAIT_MS = 30_000;
// Thinking ahead: shortly after new screen events (so a question is ready by the pause; one model call
// takes 1.5-2.5 s), with a slow periodic check as a fallback.
const PREPARE_AFTER_EVENT_MS = 1200;
const PREPARE_EVERY_MS = 8000;
/** thoughtAt / checkedAt: Date.now() when the model chose it, and when it was last checked against the narration. */
type ReadyQuestion = { question: string; kind: QuestionKind; eventId?: string; eventT?: number; heldAt?: number; thoughtAt?: number; checkedAt?: number };

/** What deliver() gets to say a question at the right moment. */
export interface DeliveryControl {
  /** Is it still a pause? Check right before the voice starts (e.g. after the TTS audio arrived). */
  stillQuiet(): boolean;
  /**
   * Call when the question actually starts being spoken (or shown); the question counts as asked from then on.
   * `voice: false`: only shown in the bubble (no audio could be played); recorded as such.
   */
  started(opts?: { voice?: boolean }): void;
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
  /** Asks Claude whether a held question was answered meanwhile (default /api/helpy/answered). */
  answeredEndpoint?: string;
}

export function createQuestionPolicy(o: PolicyOpts) {
  const deps = getDeps();
  const endpoint = o.endpoint ?? '/api/policy';

  let pending: AppEvent[] = []; // screen events not yet covered by a question
  const seen: AppEvent[] = []; // every screen event of the task (on the record), for coverage and the wrap-up
  const history: QaRecord[] = [];
  let asked = 0;
  let lastAskedAt = 0;
  let inFlight = false;
  let lastEvaluated: string | null = null; // newest event id we already evaluated and declined
  let ready: ReadyQuestion | null = null; // prepared while the expert was busy, asked at the next pause
  let delivering: ReadyQuestion | null = null; // being spoken right now: never a second time in parallel
  let disposed = false;
  let wrapping = false; // the wrap-up asks the owed questions itself
  let answerWaiter: (() => void) | null = null;
  // Decisions the expert explained before Helpy got to ask (a held question was withdrawn): never asked about.
  const explained = new Set<string>();
  const explanations: { question: string; explanation: string }[] = [];
  let lastExpertTurnAt = 0; // Date.now() of the expert's latest finished sentence
  let checking: Promise<void> | null = null; // is the held question answered already? (Claude)
  let checkAgain = false;
  let checkSoon: ReturnType<typeof setTimeout> | undefined;

  let prepareSoon: ReturnType<typeof setTimeout> | undefined;
  const off = deps.bus.on('*', (e) => {
    // A held question may be answered by what the expert says (or does) before Helpy gets to ask it.
    const expertSaid = e.type === 'utterance' && e.speaker !== 'agent' && e.meta?.toHelpy !== true;
    if (expertSaid) lastExpertTurnAt = Date.now();
    if (ready && e.text && (expertSaid || SCREEN_EVENT_TYPES.has(e.type))) {
      clearTimeout(checkSoon);
      checkSoon = setTimeout(() => void checkHeld(), ANSWERED_CHECK_DEBOUNCE_MS);
    }
    if (!SCREEN_EVENT_TYPES.has(e.type) || !e.text) return;
    if (o.getInputs().offRecord) return;
    pending.push(e);
    if (pending.length > MAX_PENDING) pending.shift();
    seen.push(e);
    if (seen.length > MAX_SEEN) seen.shift();
    clearTimeout(prepareSoon);
    prepareSoon = setTimeout(prepareAhead, PREPARE_AFTER_EVENT_MS);
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
        const event = seen.find((e) => e.id === last?.id);
        return { ask: true, question: fallbackQuestion(event, 'guardrail', req.language), eventId: last?.id, kind: 'guardrail', reason: 'fallback' };
      }
      return { ask: false, reason: 'policy unavailable' };
    }
  }

  const canAsk = (now: number): string | null => {
    if (asked >= POLICY_LIMITS.maxQuestions) return 'question budget used';
    if (asked > 0 && now - lastAskedAt < POLICY_LIMITS.minGapMs) return 'too soon after last question';
    if (awaitingAnswer(now)) return 'still waiting for the answer to the last question';
    if (!pending.length) return 'no unexplained screen events';
    // Opening an app or an invoice, scrolling, looking: nothing was decided, so there is nothing to ask about.
    if (!pending.some((e) => isDecision(e) && !explained.has(e.id))) return 'no finished decision to ask about';
    return null;
  };

  /** The last question has neither an answer nor a skip yet, and was asked recently. */
  const awaitingAnswer = (now: number) => {
    const last = history[history.length - 1];
    return !!last && last.answer === undefined && now - lastAskedAt < ANSWER_WAIT_MS;
  };

  /** Decisions on screen that nobody asked about and the expert did not explain on their own. */
  const openDecisions = () => unresolvedDecisions(seen, history).filter((e) => !explained.has(e.id));

  const coverage = () => ({
    questionsNeeded: Math.max(0, POLICY_LIMITS.minQuestions - asked),
    guardrailNeeded: !hasGuardrail(),
    unresolvedDecisions: openDecisions()
      .slice(-8)
      .map((e) => ({ id: e.id, t: e.t, text: e.text as string })),
  });

  /**
   * Was the held question answered meanwhile, in the narration or by doing it? Claude decides against the recent
   * transcript and screen events (no keyword matching). If so, the question is withdrawn: never asked, and the
   * decision it was about counts as explained.
   */
  function checkHeld(): Promise<void> {
    if (checking) {
      checkAgain = true;
      return checking;
    }
    const q = ready;
    if (!q || disposed) return Promise.resolve();
    const startedAt = Date.now();
    const since = (q.eventT ?? q.heldAt ?? 0) - 30_000;
    const req = {
      question: q.question,
      transcriptTail: o.tail(10),
      events: seen.filter((e) => e.t >= since).slice(-12).map((e) => ({ t: e.t, text: e.text as string })),
      language: deps.language?.() ?? 'en',
    };
    const run = fetch(o.answeredEndpoint ?? '/api/helpy/answered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(6000),
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ answered?: boolean; reason?: string }>) : null))
      .catch(() => null)
      .then((verdict) => {
        q.checkedAt = startedAt;
        if (verdict?.answered && ready === q && !delivering) withdraw(q, verdict.reason || 'answered');
      })
      .finally(() => {
        checking = null;
        const again = checkAgain;
        checkAgain = false;
        if (again && ready && !disposed) void checkHeld();
      });
    checking = run;
    return run;
  }

  function withdraw(q: ReadyQuestion, why: string): void {
    ready = null;
    deps.mascot.waiting?.(null);
    // What the question was about is explained now: that decision and the other decisions on the same invoice
    // (e.g. the asset number that goes with a re-coding to capex). Only other work may lead to a question.
    const about = seen.find((e) => e.id === q.eventId);
    const invoice = about?.meta?.invoiceId;
    for (const e of seen)
      if (e.id === q.eventId || (isDecision(e) && (invoice ? e.meta?.invoiceId === invoice : e.t <= (q.eventT ?? 0)))) explained.add(e.id);
    // The model's transcript tail forgets it after a few sentences: it gets the explanation with every request.
    explanations.push({ question: q.question, explanation: why });
    logPause({ t: nowRel(), pause: false, blockers: [], note: `withdrawn, the expert answered it meanwhile (${why}): ${q.question}` });
    // Think about the next open decision now, so a question is ready when the pause comes.
    clearTimeout(prepareSoon);
    prepareSoon = setTimeout(prepareAhead, 300);
  }

  /**
   * One model call over screen events (default: the pending ones). null = nothing worth asking.
   * `mustAsk`: questions are owed (wrap-up), so the model may not decline.
   */
  async function think(events: AppEvent[] = pending, mustAsk = false): Promise<ReadyQuestion | null> {
    const newest = events[events.length - 1].id;
    const force = (asked >= POLICY_LIMITS.guardrailByQuestion || mustAsk) && !hasGuardrail();
    const thoughtAt = Date.now();
    const req: PolicyRequest = {
      // Oldest first by screen time: a vision event can arrive after a newer ERP event.
      events: [...events].sort((a, b) => a.t - b.t).map((e) => ({ id: e.id, t: e.t, text: e.text as string })),
      history,
      transcriptTail: o.tail(8),
      budget: { questionsLeft: POLICY_LIMITS.maxQuestions - asked, forceGuardrail: force },
      coverage: { ...coverage(), mustAsk },
      language: deps.language?.() ?? 'en',
      screen: deps.screen?.(),
      explained: explanations.slice(-6),
    };
    const res = await fetchPolicy(req);
    if (!res.ask || !res.question) {
      lastEvaluated = newest;
      note(`model declined (${res.reason ?? 'no reason'})`);
      return null;
    }
    // Grounding: a question about an invoice that does not exist is never asked.
    const ungrounded = deps.ungroundedRefs?.(res.question) ?? [];
    if (ungrounded.length) {
      lastEvaluated = newest;
      note(`dropped, names unknown invoice ${ungrounded.join(', ')}: ${res.question}`);
      return null;
    }
    // Never the same question twice, even reworded.
    if (isDuplicateQuestion(res.question, history)) {
      lastEvaluated = newest;
      note(`dropped, already asked: ${res.question}`);
      return null;
    }
    // The question must be about one of the events it was given (screen grounding).
    const eventId = events.some((e) => e.id === res.eventId) ? res.eventId : newest;
    const eventT = events.find((e) => e.id === eventId)?.t;
    return { question: res.question, kind: res.kind ?? (force ? 'guardrail' : 'why'), eventId, eventT, thoughtAt };
  }

  /** Hold a question until the next pause; Helpy raises a hand meanwhile. */
  function hold(q: ReadyQuestion): void {
    ready = { ...q, heldAt: q.heldAt ?? nowRel() };
    deps.mascot.waiting?.(q.question);
    // The expert said something while the model was choosing it: check it against that right away.
    if (lastExpertTurnAt > (q.thoughtAt ?? 0)) {
      clearTimeout(checkSoon);
      checkSoon = setTimeout(() => void checkHeld(), 0);
    }
    logPause({ t: nowRel(), pause: false, blockers: [], note: `holding (${q.kind}): ${q.question}` });
  }

  /** The question is being said: from now on it counts as asked (once). */
  function commit(q: ReadyQuestion, voice = true): void {
    deps.mascot.waiting?.(null);
    const qe = emit({
      type: 'question_asked',
      speaker: 'agent',
      text: q.question,
      // wrapUp: asked at the end of the task (before the recording stops) because it was still owed.
      meta: { eventId: q.eventId, kind: q.kind, phase: 'capture', voice, ...(wrapping ? { wrapUp: true } : {}) },
    });
    history.push({ question: q.question, kind: q.kind, eventId: q.eventId, t: qe.t });
    asked += 1;
    lastAskedAt = Date.now();
    pending = [];
    lastEvaluated = null;
    answerWaiter?.();
    answerWaiter = null;

    deps.mascot.setState(voice ? 'speaking' : 'listening');
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
    // The expert may just have answered it: they said something since the model chose the question (or since it
    // was last checked), or a check is running. Let that check finish (briefly) before saying it.
    const stale = lastExpertTurnAt > Math.max(q.thoughtAt ?? 0, q.checkedAt ?? 0);
    if ((ready === q && checking) || stale) {
      if (ready !== q) ready = q;
      const check = checking ?? checkHeld();
      await Promise.race([check, new Promise((r) => setTimeout(r, ANSWERED_CHECK_WAIT_MS))]);
      if (ready !== q || delivering) return; // withdrawn, or already being said
    }
    delivering = q;
    ready = null;
    let committed = false;
    const started = (opts?: { voice?: boolean }) => {
      if (committed) return;
      committed = true;
      commit(q, opts?.voice ?? true);
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
    if (delivering || wrapping) return;
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
  function prepareAhead(): void {
    if (ready || inFlight || delivering) return;
    const inputs = o.getInputs();
    if (inputs.offRecord || isPause(inputs).pause) return; // pauses are handled by onPause
    if (canAsk(inputs.now) || pending[pending.length - 1].id === lastEvaluated) return;
    inFlight = true;
    void think()
      .then((q) => {
        if (!q) return;
        inFlight = false;
        // The pause may have begun while the model was thinking: ask now instead of waiting for the
        // pause loop's next retry (up to 3 s later).
        if (isPause(o.getInputs()).pause) return askNow(q);
        hold(q);
      })
      .finally(() => {
        inFlight = false;
      });
  }
  const prepare = setInterval(prepareAhead, PREPARE_EVERY_MS);

  /** The expert said "ask me now" (clicked the raised hand). */
  function askReadyNow(): boolean {
    if (!ready || delivering) return false;
    void askNow(ready);
    return true;
  }

  /** Attach the expert's answer to the latest question (for the next policy call). */
  function recordAnswer(q: Quote): void {
    const last = history[history.length - 1];
    if (last && !last.answer) {
      last.answer = q.text;
      answerWaiter?.();
      answerWaiter = null;
    }
  }

  /** The expert declined the latest question ("not now"): it is closed, and Helpy may ask about something else. */
  function recordSkip(): void {
    const last = history[history.length - 1];
    if (last && last.answer === undefined) {
      last.answer = '(skipped)';
      answerWaiter?.();
      answerWaiter = null;
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Resolves when `ok()` holds (checked every 250 ms), or false after `ms` or when cancelled. */
  async function until(ok: () => boolean, ms: number, cancelled: () => boolean): Promise<boolean> {
    const end = Date.now() + ms;
    while (!ok()) {
      if (disposed || cancelled() || Date.now() >= end) return false;
      await sleep(250);
    }
    return true;
  }

  /** The next question still owed at the end of the task: the model's choice, or a grounded fallback. */
  async function owedQuestion(): Promise<ReadyQuestion | null> {
    const open = openDecisions();
    const events = open.length ? open : seen.filter((e) => !history.some((h) => h.eventId === e.id) && !explained.has(e.id));
    if (!events.length) return null;
    const needGuardrail = !hasGuardrail();
    const fromModel = await think(events, true);
    if (fromModel && (!needGuardrail || fromModel.kind === 'guardrail')) return fromModel;
    // Without a usable model answer: a question built from the newest open decision, never one already asked.
    const lang = deps.language?.() ?? 'en';
    const kinds: QuestionKind[] = needGuardrail ? ['guardrail'] : ['why', 'guardrail', 'exception'];
    for (const e of [...events].reverse())
      for (const kind of kinds) {
        const question = fallbackQuestion(e, kind, lang);
        if (!isDuplicateQuestion(question, history)) return { question, kind, eventId: e.id };
      }
    return null;
  }

  /**
   * Capture is ending. If fewer than the minimum questions (or no guardrail question) were asked, Helpy
   * asks the owed ones now about decisions still unexplained on screen, each at a pause, waiting for the
   * answer. Resolves with the coverage reached. `cancelled()` (e.g. "I'm done" clicked again) stops it.
   */
  async function wrapUp(opts: { cancelled?: () => boolean; onStart?: (owed: number) => void } = {}): Promise<{ asked: number; hasGuardrail: boolean }> {
    const cancelled = opts.cancelled ?? (() => false);
    const owed = () => (asked < POLICY_LIMITS.minQuestions || !hasGuardrail()) && asked < POLICY_LIMITS.maxQuestions;
    clearInterval(prepare);
    clearTimeout(prepareSoon);
    wrapping = true;
    try {
      return await askOwed(cancelled, owed, opts.onStart);
    } finally {
      wrapping = false;
    }
  }

  async function askOwed(cancelled: () => boolean, owed: () => boolean, onStart?: (owed: number) => void) {
    let announced = false;
    while (owed() && !disposed && !cancelled() && !o.getInputs().offRecord) {
      const before = asked;
      // A question held back during the task (raised hand) is the most natural one: it goes first.
      const q = ready ?? (await owedQuestion());
      if (!q || cancelled()) break;
      if (!announced) {
        announced = true;
        onStart?.(Math.max(POLICY_LIMITS.minQuestions - asked, 1));
      }
      if (!(await until(() => isPause(o.getInputs()).pause && !delivering, WRAP_PAUSE_WAIT_MS, cancelled))) break;
      await askNow(q);
      if (asked === before) break; // not said (the expert became busy and stayed busy)
      const answered = new Promise<void>((r) => (answerWaiter = r));
      if (!history[history.length - 1]?.answer) await Promise.race([answered, sleep(WRAP_ANSWER_WAIT_MS)]);
      answerWaiter = null;
      note(`wrap-up asked (${q.kind}): ${q.question}`);
    }
    return { asked, hasGuardrail: hasGuardrail() };
  }

  return {
    onPause,
    askReadyNow,
    recordAnswer,
    recordSkip,
    wrapUp,
    stats: () => ({ asked, hasGuardrail: hasGuardrail(), history: [...history], waiting: ready?.question ?? null, coverage: coverage() }),
    dispose: () => {
      disposed = true;
      answerWaiter?.();
      off();
      clearInterval(prepare);
      clearTimeout(prepareSoon);
      clearTimeout(checkSoon);
      if (ready) deps.mascot.waiting?.(null);
    },
  };
}

export type QuestionPolicy = ReturnType<typeof createQuestionPolicy>;
