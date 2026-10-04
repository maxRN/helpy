// Screen events and the current screen -> the agent's context (interviewer, debrief and tutor alike).
// - On start: what is on screen right now, so a freshly started agent (e.g. after a mode switch) is not blind.
// - Screen events arriving within 500 ms are merged into one update, followed by what is visible now.
// - Every 1.5 s: if what is visible changed without an event, the new state is sent. Same text is never resent.
import { mmss } from './deps';
import { SCREEN_EVENT_TYPES, type AppEvent } from './types';

export interface ScreenFeedOpts {
  send(text: string): void;
  /** What is visible now (no ages in it, so an unchanged screen gives the same text). */
  screen?(): string | null;
  isOffRecord(): boolean;
  /** ms since session start, for the [SCREEN mm:ss] stamp. */
  now(): number;
  batchMs?: number; // default 500
  pollMs?: number; // default 1500
}

export function startScreenFeed(o: ScreenFeedOpts) {
  let batch: AppEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastScreen = '';

  const current = (): string => {
    try {
      return o.screen?.()?.trim() ?? '';
    } catch {
      return '';
    }
  };

  const flush = () => {
    timer = null;
    const events = batch;
    batch = [];
    if (o.isOffRecord() || !events.length) return;
    const body = events.map((e) => e.text).filter(Boolean).join('; ');
    if (!body) return;
    const screen = current();
    lastScreen = screen || lastScreen;
    // Recording time when there is a recording; otherwise (Teach) events have t = 0: use the agent's clock.
    const at = events[0].t > 0 ? events[0].t : o.now();
    o.send(`[SCREEN ${mmss(at)}] ${body}${screen ? `\nNow on screen: ${screen}` : ''}`);
  };

  const poll = () => {
    if (o.isOffRecord() || timer) return; // a batch with the current screen is about to go out
    const screen = current();
    if (!screen || screen === lastScreen) return;
    lastScreen = screen;
    o.send(`[SCREEN ${mmss(o.now())}] Now on screen: ${screen}`);
  };

  poll();
  const interval = setInterval(poll, o.pollMs ?? 1500);

  return {
    onEvent(e: AppEvent) {
      if (!SCREEN_EVENT_TYPES.has(e.type) || o.isOffRecord()) return;
      batch.push(e);
      if (!timer) timer = setTimeout(flush, o.batchMs ?? 500);
    },
    dispose() {
      clearInterval(interval);
      if (timer) clearTimeout(timer);
    },
  };
}
