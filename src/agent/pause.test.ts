import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAUSE_THRESHOLDS as TH, clearPauseLog, getPauseLog, isPause, startPauseLoop, type PauseInputs } from './pause';

const base = (over: Partial<PauseInputs> = {}): PauseInputs => ({
  now: 100_000,
  lastTypingAt: 100_000 - 10_000,
  userSilentForMs: 10_000,
  agentSpeaking: false,
  offRecord: false,
  ...over,
});

describe('isPause', () => {
  it('is a pause when everything is quiet', () => {
    expect(isPause(base())).toEqual({ pause: true, blockers: [] });
  });

  it('treats exactly-at-threshold as a pause (>=)', () => {
    const r = isPause(
      base({
        lastTypingAt: 100_000 - TH.sinceTypingMs,
        userSilentForMs: TH.userSilentMs,
      }),
    );
    expect(r.pause).toBe(true);
  });

  it('blocks while typing', () => {
    const r = isPause(base({ lastTypingAt: 100_000 - (TH.sinceTypingMs - 1) }));
    expect(r.pause).toBe(false);
    expect(r.blockers[0]).toMatch(/typing/);
  });

  it('blocks while the expert is talking (no endpointing: VAD silence)', () => {
    expect(isPause(base({ userSilentForMs: 300 })).pause).toBe(false);
  });

  it('with Scribe endpointing, an open turn blocks; after a committed one Helpy waits a short breath', () => {
    expect(isPause(base({ endpointing: true, turnOpen: true, userSilentForMs: 200 })).pause).toBe(false);
    // Scribe just committed the turn after 0.8 s silence: often only a breath between sentences (user feedback:
    // asking right then interrupts). Helpy waits afterTurnMs.
    expect(isPause(base({ endpointing: true, turnOpen: false, userSilentForMs: 0 })).pause).toBe(false);
    expect(isPause(base({ endpointing: true, turnOpen: false, userSilentForMs: TH.afterTurnMs })).pause).toBe(true);
  });

  it('holds questions while the expert clicks into fields (mid-step), not afterwards', () => {
    expect(isPause(base({ lastFieldAt: 100_000 - 1000 })).blockers[0]).toMatch(/working in a field/);
    expect(isPause(base({ lastFieldAt: 100_000 - TH.sinceFieldMs })).pause).toBe(true);
  });

  it('an open turn without speech for a long time is stale and does not block forever', () => {
    expect(isPause(base({ endpointing: true, turnOpen: true, userSilentForMs: TH.staleTurnMs })).pause).toBe(true);
  });

  it('blocks while a turn addressed to Helpy is being answered', () => {
    expect(isPause(base({ replyPending: true })).blockers).toEqual(['answering the expert']);
  });

  it('blocks while the agent speaks or when off the record', () => {
    expect(isPause(base({ agentSpeaking: true })).pause).toBe(false);
    expect(isPause(base({ offRecord: true })).pause).toBe(false);
  });

  it('lists every blocker', () => {
    const r = isPause(base({ agentSpeaking: true, offRecord: true, userSilentForMs: 0 }));
    expect(r.blockers).toHaveLength(3);
  });

  it('has no input for mouse movement or screen changes: they can never block', () => {
    // Pointer activity is deliberately not part of PauseInputs (see src/shared/activity.ts).
    expect(Object.keys(base())).not.toContain('lastPointerAt');
    expect(Object.keys(base())).not.toContain('lastFrameChangeAt');
  });
});

describe('startPauseLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    clearPauseLog();
  });
  afterEach(() => vi.useRealTimers());

  it('fires once on the rising edge, retries every retryMs, re-arms after activity', () => {
    let lastTypingAt = 0; // long ago -> quiet
    const onPause = vi.fn();
    const stop = startPauseLoop({
      getInputs: () => ({
        now: Date.now(),
        lastTypingAt,
        userSilentForMs: 60_000,
        agentSpeaking: false,
        offRecord: false,
      }),
      onPause,
      intervalMs: 250,
      retryMs: 3000,
    });

    vi.advanceTimersByTime(1000);
    expect(onPause).toHaveBeenCalledTimes(1); // rising edge only

    vi.advanceTimersByTime(3000);
    expect(onPause).toHaveBeenCalledTimes(2); // retry while still paused

    lastTypingAt = Date.now(); // expert types again
    vi.advanceTimersByTime(1000);
    expect(onPause).toHaveBeenCalledTimes(2); // silent while busy

    vi.advanceTimersByTime(3000); // 2.5 s after last input -> pause again
    expect(onPause).toHaveBeenCalledTimes(3);

    expect(getPauseLog().some((e) => !e.pause && e.blockers.length > 0)).toBe(true);
    stop();
  });
});

describe('isPause: in the middle of an invoice', () => {
  it('a breath between two sentences is no pause while the expert is mid-invoice', () => {
    const r = isPause(base({ midTask: true, lastTypingAt: 100_000 - 3_000, userSilentForMs: 2_000 }));
    expect(r.pause).toBe(false);
    expect(r.blockers.join()).toContain('middle of an invoice');
  });

  it('a long quiet moment mid-invoice is a pause (the expert may be stuck or thinking)', () => {
    expect(isPause(base({ midTask: true, lastTypingAt: 100_000 - TH.midTaskQuietMs, userSilentForMs: TH.midTaskQuietMs, lastFieldAt: 100_000 - TH.midTaskQuietMs })).pause).toBe(true);
  });

  it('after the invoice is finished, a normal pause is enough', () => {
    expect(isPause(base({ midTask: false, lastTypingAt: 100_000 - 3_000, userSilentForMs: 2_000 })).pause).toBe(true);
  });
});
