// Live questions in Capture: when they are spoken (typing and speech hold them back, the mouse never does),
// and that each one is spoken exactly once.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { activity, installActivityTracker } from '../shared/activity';
import { ungroundedInvoiceRefs } from '../shared/grounding';
import { getDeps, setDeps } from './deps';
import type { DeliveryControl } from './policy';
import type { AppEvent, Deps } from './types';
import { startCaptureWithoutAgent, stop } from './voice';

// The real activity tracker listens on window; a bare EventTarget stands in for it.
const fakeWindow = new EventTarget();
const typeKey = () => fakeWindow.dispatchEvent(new Event('keydown'));
const moveMouse = () => fakeWindow.dispatchEvent(new Event('pointermove'));

let listeners: Array<(e: AppEvent) => void>;
let emitted: AppEvent[];
let turnOpen: boolean;
let lastSpeechAt: number;
let deliver: ReturnType<typeof vi.fn<(q: string, c: DeliveryControl) => Promise<boolean>>>;
let spoken: string[];
// The activity tracker keeps its state across tests, so every test starts later than the last one.
let clock = 1_000_000;

function screenEvent(text = 'Invoice 4471: cost center 4711 → 0400 (capex)') {
  const e: AppEvent = { id: `e${listeners.length}-${Date.now()}`, t: 0, type: 'dom', text };
  for (const fn of listeners) fn(e);
}

const askedEvents = () => emitted.filter((e) => e.type === 'question_asked');

beforeAll(() => {
  vi.stubGlobal('window', fakeWindow);
  installActivityTracker();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime((clock += 10_000_000));
  listeners = [];
  emitted = [];
  turnOpen = false;
  lastSpeechAt = 0;
  spoken = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ask: true, question: 'You moved that one to capex. What made you do that?', eventId: '', kind: 'why' }),
    })),
  );
  // Like the TTS path: say it only if it is still quiet once the audio is ready.
  deliver = vi.fn(async (q: string, c: DeliveryControl) => {
    await new Promise((r) => setTimeout(r, 400)); // TTS round trip
    if (!c.stillQuiet()) return false;
    c.started();
    spoken.push(q);
    return true;
  });
  const deps: Deps = {
    bus: {
      emit: (e) => void emitted.push(e),
      on: (_type, fn) => {
        listeners.push(fn);
        return () => (listeners = listeners.filter((l) => l !== fn));
      },
    },
    session: { t0: Date.now() },
    activity: { lastTypingAt: activity.lastTypingAt },
    speech: { lastSpeechAt: () => lastSpeechAt, active: () => true, turnOpen: () => turnOpen, replyPending: () => false },
    isSpeaking: () => false,
    mascot: { setState: vi.fn(), bubble: vi.fn(), pointTo: vi.fn(), waiting: vi.fn() },
    getNextStep: () => null,
    showExpertClip: vi.fn(),
  };
  setDeps(deps);
});

afterEach(async () => {
  await stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.stubGlobal('window', fakeWindow);
});

/** Repeats `fn` every `everyMs` for `forMs`, letting timers and promises run. */
async function keepDoing(fn: () => void, everyMs: number, forMs: number) {
  for (let t = 0; t < forMs; t += everyMs) {
    fn();
    await vi.advanceTimersByTimeAsync(everyMs);
  }
}

describe('live question timing', () => {
  it('A: typing delays the question until the expert stops typing', async () => {
    startCaptureWithoutAgent(deliver);
    screenEvent();
    await keepDoing(typeKey, 300, 10_000);
    expect(spoken).toEqual([]);

    await vi.advanceTimersByTimeAsync(4_000); // typing stopped 2.5 s ago + model + TTS
    expect(spoken).toHaveLength(1);
  });

  it('B: speech delays the question until Scribe ends the turn', async () => {
    startCaptureWithoutAgent(deliver);
    screenEvent();
    turnOpen = true;
    await keepDoing(() => (lastSpeechAt = Date.now()), 250, 8_000);
    expect(spoken).toEqual([]);

    turnOpen = false; // Scribe committed the turn (its own VAD silence)
    lastSpeechAt = Date.now();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(spoken).toHaveLength(1);
  });

  it('C: moving the mouse continuously does not delay the question', async () => {
    startCaptureWithoutAgent(deliver);
    screenEvent();
    await keepDoing(moveMouse, 50, 2_000);
    expect(activity.lastPointerAt()).toBeGreaterThan(0); // the mouse really moved
    expect(spoken).toHaveLength(1);
  });

  it('D: a pending question is spoken only once, however often the pause loop fires', async () => {
    let finish!: () => void;
    deliver.mockImplementation(async (q, c) => {
      c.started();
      spoken.push(q);
      await new Promise<void>((r) => (finish = r)); // still speaking
      return true;
    });
    startCaptureWithoutAgent(deliver);
    screenEvent();
    await vi.advanceTimersByTimeAsync(10_000); // the loop retries every 3 s while it stays quiet
    finish();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(askedEvents()).toHaveLength(1);
  });

  it('latency: a question thought out while the expert typed is asked as soon as the pause begins', async () => {
    // One policy call takes ~2 s (measured 1.6-2.6 s against /api/policy).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 2_000));
        return { ok: true, json: async () => ({ ask: true, question: 'Why capex?', eventId: '', kind: 'why' }) };
      }),
    );
    startCaptureWithoutAgent(deliver);
    typeKey();
    screenEvent();
    await keepDoing(typeKey, 250, 500); // typing stops at ~0.5 s: pause at ~3 s
    // Think-ahead starts 1.2 s after the event (still typing) and answers at ~3.2 s, inside the pause.
    await vi.advanceTimersByTimeAsync(3_400);
    expect(spoken).toEqual(['Why capex?']); // not held until the pause loop's next retry (~6 s)
  });

  it('never asks about an invoice that does not exist (grounding)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ ask: true, question: 'You held invoice 42. Why that one?', eventId: '', kind: 'why' }) })),
    );
    setDeps({ ...getDeps(), ungroundedRefs: (text) => ungroundedInvoiceRefs(text, ['4471', '4472', '4473']) });
    startCaptureWithoutAgent(deliver);
    screenEvent('Invoice 4472: put on hold');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deliver).not.toHaveBeenCalled();
    expect(askedEvents()).toHaveLength(0);
  });

  it('E: if the expert starts talking just before Helpy speaks, the question waits and is asked once at the next pause', async () => {
    deliver.mockImplementationOnce(async (_q, c) => {
      turnOpen = true; // the expert starts talking while the TTS audio is generated
      lastSpeechAt = Date.now();
      await new Promise((r) => setTimeout(r, 400));
      return c.stillQuiet() ? (c.started(), true) : false;
    });
    startCaptureWithoutAgent(deliver);
    screenEvent();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(askedEvents()).toHaveLength(0); // not said, so not asked

    await keepDoing(() => (lastSpeechAt = Date.now()), 250, 4_000);
    expect(spoken).toEqual([]);

    turnOpen = false; // quiet again
    await vi.advanceTimersByTimeAsync(2_000);
    expect(spoken).toEqual(['You moved that one to capex. What made you do that?']);
    expect(askedEvents()).toHaveLength(1);
  });
});

// ---- coverage: at least three live questions, one about a guardrail, never repeated, always grounded ----

function decisionEvent(meta: Record<string, unknown>, text: string) {
  const e: AppEvent = { id: `d${Math.random().toString(36).slice(2)}`, t: Date.now() % 1_000_000, type: 'dom', text, meta };
  for (const fn of listeners) fn(e);
  return e;
}

/** The model as a stub: `answers` in order, then declines. Records every request. */
function stubPolicy(answers: Array<Record<string, unknown>>) {
  const requests: Array<Record<string, any>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      const next = answers.shift() ?? { ask: false, reason: 'nothing new' };
      return { ok: true, json: async () => next };
    }),
  );
  return requests;
}

describe('live question coverage', () => {
  it('tells the model which decisions are still unexplained and how many questions are owed', async () => {
    const requests = stubPolicy([]);
    startCaptureWithoutAgent(deliver);
    const e = decisionEvent({ kind: 'field_changed', field: 'costCenter' }, 'Invoice 4471: cost center 4711 → 0400 (capex)');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(requests[0].coverage.questionsNeeded).toBe(3);
    expect(requests[0].coverage.guardrailNeeded).toBe(true);
    expect(requests[0].coverage.unresolvedDecisions.map((d: { id: string }) => d.id)).toEqual([e.id]);
  });

  it('drops a reworded repeat of a question already asked', async () => {
    stubPolicy([
      { ask: true, question: 'You moved that one to capex. What made you do that?', eventId: '', kind: 'why' },
      { ask: true, question: 'You moved this one to capex, what made you do it?', eventId: '', kind: 'why' },
    ]);
    startCaptureWithoutAgent(deliver);
    decisionEvent({ kind: 'field_changed', field: 'costCenter' }, 'Invoice 4471: cost center 4711 → 0400 (capex)');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(spoken).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(31_000); // past the minimum gap
    decisionEvent({ kind: 'field_changed', field: 'costCenter' }, 'Invoice 4472: cost center 4711 → 0400 (capex)');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(spoken).toHaveLength(1);
  });

  it('keeps the question tied to an event it was given, even if the model names another id', async () => {
    stubPolicy([{ ask: true, question: 'You held the Kramer invoice. Why that one?', eventId: 'made-up', kind: 'why' }]);
    startCaptureWithoutAgent(deliver);
    const e = decisionEvent({ kind: 'action', action: 'hold' }, 'Invoice 4472: put on hold');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(askedEvents()[0].meta?.eventId).toBe(e.id);
  });

  it('wrap-up: asks the owed questions at pauses, about unexplained decisions, with a guardrail among them', async () => {
    stubPolicy([]); // the model never wants to ask during the task
    startCaptureWithoutAgent(deliver);
    const capex = decisionEvent({ kind: 'field_changed', field: 'costCenter' }, 'Invoice 4471: cost center 4711 → 0400 (capex)');
    const hold = decisionEvent({ kind: 'action', action: 'hold' }, 'Invoice 4472: put on hold');
    const second = decisionEvent({ kind: 'action', action: 'request_approval' }, 'Invoice 4473: sent for a second approval');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(spoken).toEqual([]);

    const { wrapUpCapture } = await import('./voice');
    const onStart = vi.fn();
    const done = wrapUpCapture({ onStart });
    await vi.advanceTimersByTimeAsync(3 * 31_000);
    const result = await done;

    expect(onStart).toHaveBeenCalledWith(3);
    expect(result.asked).toBe(3);
    expect(result.hasGuardrail).toBe(true);
    const asked = askedEvents();
    expect(new Set(asked.map((a) => a.text)).size).toBe(3);
    expect(asked.map((a) => a.meta?.eventId).every((id) => [capex.id, hold.id, second.id].includes(id as string))).toBe(true);
    expect(asked[0].meta?.kind).toBe('guardrail'); // the guardrail question is owed first
  });

  it('wrap-up: never speaks while the expert types', async () => {
    stubPolicy([]);
    startCaptureWithoutAgent(deliver);
    decisionEvent({ kind: 'action', action: 'hold' }, 'Invoice 4472: put on hold');
    const { wrapUpCapture } = await import('./voice');
    const done = wrapUpCapture();
    await keepDoing(typeKey, 300, 6_000);
    expect(spoken).toEqual([]);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(spoken).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(120_000);
    await done;
  });

  it('wrap-up: nothing is owed once three questions incl. a guardrail were asked during the task', async () => {
    stubPolicy([
      { ask: true, question: 'You moved that one to capex. What made you do that?', eventId: '', kind: 'why' },
      { ask: true, question: 'Is there an amount limit for capex?', eventId: '', kind: 'guardrail' },
      { ask: true, question: 'You held the Kramer invoice. Why that one?', eventId: '', kind: 'why' },
    ]);
    startCaptureWithoutAgent(deliver);
    for (const text of ['Invoice 4471: cost center 4711 → 0400 (capex)', 'Invoice 4471: asset number → A-1', 'Invoice 4472: put on hold']) {
      decisionEvent({ kind: 'field_changed', field: 'costCenter' }, text);
      await vi.advanceTimersByTimeAsync(31_000);
    }
    expect(spoken).toHaveLength(3);
    const { wrapUpCapture } = await import('./voice');
    const result = await wrapUpCapture();
    expect(result).toEqual({ asked: 3, hasGuardrail: true });
    expect(spoken).toHaveLength(3);
  });
});
