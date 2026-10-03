import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAUSE_THRESHOLDS as TH, clearPauseLog, getPauseLog, isPause, startPauseLoop, type PauseInputs } from './pause';

const base = (over: Partial<PauseInputs> = {}): PauseInputs => ({
  now: 100_000,
  lastInputAt: 100_000 - 10_000,
  lastFrameChangeAt: 100_000 - 10_000,
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
        lastInputAt: 100_000 - TH.sinceInputMs,
        lastFrameChangeAt: 100_000 - TH.sinceFrameChangeMs,
        userSilentForMs: TH.userSilentMs,
      }),
    );
    expect(r.pause).toBe(true);
  });

  it('blocks while typing', () => {
    const r = isPause(base({ lastInputAt: 100_000 - (TH.sinceInputMs - 1) }));
    expect(r.pause).toBe(false);
    expect(r.blockers[0]).toMatch(/typing/);
  });

  it('blocks while the screen is changing', () => {
    expect(isPause(base({ lastFrameChangeAt: 100_000 - 500 })).pause).toBe(false);
  });

  it('blocks while the expert is talking', () => {
    expect(isPause(base({ userSilentForMs: 300 })).pause).toBe(false);
  });

  it('blocks while the agent speaks or when off the record', () => {
    expect(isPause(base({ agentSpeaking: true })).pause).toBe(false);
    expect(isPause(base({ offRecord: true })).pause).toBe(false);
  });

  it('lists every blocker', () => {
    const r = isPause(base({ agentSpeaking: true, offRecord: true, userSilentForMs: 0 }));
    expect(r.blockers).toHaveLength(3);
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
    let lastInputAt = 0; // long ago -> quiet
    const onPause = vi.fn();
    const stop = startPauseLoop({
      getInputs: () => ({
        now: Date.now(),
        lastInputAt,
        lastFrameChangeAt: 0,
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

    lastInputAt = Date.now(); // expert types again
    vi.advanceTimersByTime(1000);
    expect(onPause).toHaveBeenCalledTimes(2); // silent while busy

    vi.advanceTimersByTime(3000); // 2.5 s after last input -> pause again
    expect(onPause).toHaveBeenCalledTimes(3);

    expect(getPauseLog().some((e) => !e.pause && e.blockers.length > 0)).toBe(true);
    stop();
  });
});
