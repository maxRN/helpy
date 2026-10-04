// Answer to judge question 2: "What to ask?"
// The policy keeps track of which decisions on screen are still unexplained, so the live questions cover
// reasons and at least one guardrail, never repeat themselves, and stay about what was on screen.
import type { AppEvent, QaRecord, QuestionKind } from './types';

/** Screen events that are a decision (something was changed or decided), not just looking. */
export function isDecision(e: Pick<AppEvent, 'meta'>): boolean {
  const kind = e.meta?.kind;
  if (kind === 'field_changed') return true;
  return kind === 'action' && e.meta?.action !== 'post';
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

/** Same question again, maybe reworded: identical, or most of its words already asked. */
export function isDuplicateQuestion(question: string, history: readonly Pick<QaRecord, 'question'>[]): boolean {
  const mine = new Set(words(question));
  if (mine.size === 0) return false;
  return history.some((h) => {
    const theirs = new Set(words(h.question));
    let shared = 0;
    for (const w of mine) if (theirs.has(w)) shared++;
    return shared / Math.min(mine.size, theirs.size || 1) >= 0.75;
  });
}

/** Decisions nobody asked about yet, oldest first. */
export function unresolvedDecisions(seen: readonly AppEvent[], history: readonly QaRecord[]): AppEvent[] {
  const asked = new Set(history.map((h) => h.eventId).filter(Boolean));
  return seen.filter((e) => isDecision(e) && !asked.has(e.id)).sort((a, b) => a.t - b.t);
}

type Lang = 'de' | 'en';

const FIELD_WORD: Record<string, { en: string; de: string }> = {
  costCenter: { en: 'the cost center', de: 'die Kostenstelle' },
  account: { en: 'the account', de: 'das Konto' },
  assetNumber: { en: 'the asset number', de: 'die Anlagennummer' },
  category: { en: 'the category', de: 'die Kategorie' },
};

/**
 * A short spoken question about one screen event, without the model: used when the model is unavailable
 * or keeps declining while questions are still owed. It names what happened on screen, never a code.
 */
export function fallbackQuestion(e: Pick<AppEvent, 'meta'> | undefined, kind: QuestionKind, lang: Lang = 'en'): string {
  const m = e?.meta ?? {};
  const de = lang === 'de';
  if (m.kind === 'action' && m.action === 'hold') {
    return kind === 'guardrail'
      ? de ? 'Wann hältst du eine Rechnung zurück, und wer gibt sie wieder frei?' : 'When do you hold an invoice, and who releases it?'
      : de ? 'Du hast die Rechnung zurückgehalten. Warum diese?' : 'You put that invoice on hold. Why that one?';
  }
  if (m.kind === 'action' && m.action === 'request_approval') {
    return kind === 'guardrail'
      ? de ? 'Welche Rechnungen brauchen immer eine zweite Freigabe?' : 'Which invoices always need a second approval?'
      : de ? 'Du hast eine zweite Freigabe angefordert. Warum hier?' : 'You asked for a second approval there. Why?';
  }
  if (m.kind === 'field_changed') {
    const field = FIELD_WORD[String(m.field ?? '')] ?? { en: 'that field', de: 'das Feld' };
    return kind === 'guardrail'
      ? de ? `Gibt es eine Betragsgrenze, ab der du ${field.de} so änderst?` : `Is there an amount limit where you change ${field.en} like that?`
      : de ? `Du hast ${field.de} geändert. Warum?` : `You changed ${field.en} there. What made you do that?`;
  }
  if (kind === 'guardrail') return de ? 'Wann würdest du bei so einer Rechnung aufhören und jemanden fragen?' : 'When would you stop on an invoice like this and ask someone?';
  if (kind === 'exception') return de ? 'Wann machst du das anders?' : 'When would you do this differently?';
  return de ? 'Was hast du da gerade geprüft?' : 'What did you just check there?';
}
