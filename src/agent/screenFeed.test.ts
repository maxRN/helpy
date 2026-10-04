import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startScreenFeed } from './screenFeed';
import type { AppEvent } from './types';

let sent: string[];
let screen: string;
let offRecord: boolean;
const feeds: Array<{ dispose(): void }> = [];

const start = () => {
  const feed = startScreenFeed({ send: (t) => sent.push(t), screen: () => screen, isOffRecord: () => offRecord, now: () => 65_000 });
  feeds.push(feed);
  return feed;
};
const dom = (text: string, t = 61_000): AppEvent => ({ id: text, t, type: 'dom', text });

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  screen = 'App state (live, exact): ProcureFlow inbox, no invoice open.';
  offRecord = false;
});
afterEach(() => {
  feeds.splice(0).forEach((f) => f.dispose());
  vi.useRealTimers();
});

describe('screen feed to the agent', () => {
  it('a freshly started agent (e.g. after a mode switch) gets the current screen at once', () => {
    start();
    expect(sent).toEqual(['[SCREEN 01:05] Now on screen: App state (live, exact): ProcureFlow inbox, no invoice open.']);
  });

  it('merges events and adds what is visible now; an unchanged screen is not sent again', () => {
    const feed = start();
    screen = 'App state (live, exact): ProcureFlow, invoice 4471 open.';
    feed.onEvent(dom('Opened invoice 4471'));
    feed.onEvent(dom('Invoice 4471: cost center 4711 to 0400'));
    vi.advanceTimersByTime(500);
    expect(sent.at(-1)).toBe(
      '[SCREEN 01:01] Opened invoice 4471; Invoice 4471: cost center 4711 to 0400\nNow on screen: App state (live, exact): ProcureFlow, invoice 4471 open.',
    );
    vi.advanceTimersByTime(10_000);
    expect(sent).toHaveLength(2);
  });

  it('sends a changed screen within 1.5 s even without an event', () => {
    start();
    screen = 'Last screenshot: the Brno invoice is open.';
    vi.advanceTimersByTime(1_500);
    expect(sent.at(-1)).toBe('[SCREEN 01:05] Now on screen: Last screenshot: the Brno invoice is open.');
  });

  it('sends nothing off the record', () => {
    offRecord = true;
    const feed = start();
    feed.onEvent(dom('Opened invoice 4471'));
    screen = 'something else';
    vi.advanceTimersByTime(5_000);
    expect(sent).toEqual([]);
  });

  it('ignores events that are not about the screen', () => {
    const feed = start();
    feed.onEvent({ id: 'u', t: 0, type: 'utterance', text: 'hello' });
    vi.advanceTimersByTime(1_000);
    expect(sent).toHaveLength(1); // only the initial screen
  });
});
