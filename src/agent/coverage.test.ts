import { describe, expect, it } from 'vitest';
import { fallbackQuestion, isDecision, isDuplicateQuestion, unresolvedDecisions } from './coverage';
import type { AppEvent } from './types';

const ev = (id: string, meta: Record<string, unknown>, t = 0): AppEvent => ({ id, t, type: 'dom', text: id, meta });

describe('question coverage helpers', () => {
  it('counts changes and decisions, not opening or posting', () => {
    expect(isDecision(ev('a', { kind: 'field_changed' }))).toBe(true);
    expect(isDecision(ev('b', { kind: 'action', action: 'hold' }))).toBe(true);
    expect(isDecision(ev('c', { kind: 'action', action: 'post' }))).toBe(false);
    expect(isDecision(ev('d', { kind: 'invoice_opened' }))).toBe(false);
  });

  it('finds decisions nobody asked about yet, oldest first', () => {
    const seen = [ev('late', { kind: 'action', action: 'hold' }, 20), ev('early', { kind: 'field_changed' }, 10), ev('asked', { kind: 'field_changed' }, 5)];
    expect(unresolvedDecisions(seen, [{ question: 'q', kind: 'why', t: 6, eventId: 'asked' }]).map((e) => e.id)).toEqual(['early', 'late']);
  });

  it('recognizes a reworded repeat but not a new question', () => {
    const history = [{ question: 'You moved that one to capex. What made you do that?' }];
    expect(isDuplicateQuestion('You moved this one to capex — what made you do it?', history)).toBe(true);
    expect(isDuplicateQuestion('Who releases the Kramer invoice after the hold?', history)).toBe(false);
  });

  it('builds grounded fallback questions without codes', () => {
    const q = fallbackQuestion(ev('x', { kind: 'field_changed', field: 'costCenter' }), 'why');
    expect(q).toBe('You changed the cost center there. What made you do that?');
    expect(fallbackQuestion(ev('y', { kind: 'action', action: 'hold' }), 'guardrail')).toMatch(/hold.*releases/);
    expect(fallbackQuestion(ev('z', { kind: 'action', action: 'hold' }), 'why', 'de')).toMatch(/zurückgehalten/);
    for (const kind of ['why', 'guardrail', 'exception'] as const) expect(fallbackQuestion(undefined, kind)).not.toMatch(/\d/);
  });
});
