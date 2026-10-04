import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setDeps } from './deps';
import { createTranscript } from './transcript';
import type { Deps } from './types';

let now = 1_000_000;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  setDeps({
    bus: { emit: () => undefined, on: () => () => undefined },
    session: { t0: 1_000_000 },
    activity: { lastTypingAt: () => 0 },
    mascot: { setState: vi.fn(), bubble: vi.fn(), pointTo: vi.fn() },
    getNextStep: () => null,
    showExpertClip: vi.fn(),
  } as Deps);
});

describe('transcript', () => {
  it('keeps the expert’s own words since a moment (for teach-back corrections), never the agent’s or control lines', () => {
    const tr = createTranscript({ mode: 'debrief', isOffRecord: () => false, onUserSpeech: () => undefined, takeSpeechStart: () => null });
    now += 5_000;
    tr.ingest({ source: 'user', message: 'Before the teach-back.' });
    now += 1_000;
    const startedAt = now - 1_000_000; // the teach-back starts
    now += 5_000;
    tr.ingest({ source: 'ai', message: 'Is that how it works?' });
    tr.ingest({ source: 'user', message: '[TEACHBACK] You open the invoice…' });
    now += 2_000;
    tr.ingest({ source: 'user', message: 'No, Kramer is held at every quarter-end,' });
    tr.ingest({ source: 'user', message: 'not only in December.' });
    expect(tr.userSince(startedAt)).toEqual(['No, Kramer is held at every quarter-end,', 'not only in December.']);
  });

  it('keeps nothing said off the record', () => {
    let off = true;
    const tr = createTranscript({ mode: 'debrief', isOffRecord: () => off, onUserSpeech: () => undefined, takeSpeechStart: () => null });
    tr.ingest({ source: 'user', message: 'private' });
    off = false;
    tr.ingest({ source: 'user', message: 'public' });
    expect(tr.userSince(0)).toEqual(['public']);
  });
});
