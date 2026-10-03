import type { AppEvent, Deps } from './types';

let deps: Deps | null = null;

/** Call once at app start with adapters for P1/P3/P4 modules. */
export function setDeps(d: Deps): void {
  deps = d;
}

export function getDeps(): Deps {
  if (!deps) throw new Error('[agent] call setDeps() before start()');
  return deps;
}

/** ms since session.t0 */
export const nowRel = (): number => Date.now() - getDeps().session.t0;

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Build an AppEvent (id + t filled in), put it on the bus, and return it. */
export function emit(e: Omit<AppEvent, 'id' | 't'> & { t?: number }): AppEvent {
  const { t, ...rest } = e;
  const full: AppEvent = { ...rest, id: uid(), t: t ?? nowRel() };
  getDeps().bus.emit(full);
  return full;
}
