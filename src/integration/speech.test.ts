import { describe, expect, it } from 'vitest'
import { ANSWER_WINDOW_MS, looksLikeQuestionBack, mightBeToHelpy, normalizeTurn, recordCommand, routeTurn, SpeechTracker } from './speech'

describe('mightBeToHelpy (first filter before Claude decides)', () => {
  it('lets through everything that could be meant for Helpy', () => {
    for (const t of [
      'Hörst du mich?',
      'Kannst du auch auf Deutsch antworten?',
      'Antwortet gefälligst, wenn ich mit dir spreche.',
      'Hast du das verstanden',
      'Helpy, bist du da?',
      'Can you hear me?',
      "Why aren't you answering?",
      'Sprich bitte Deutsch mit mir?',
    ]) {
      expect(mightBeToHelpy(t), t).toBe(true)
    }
  })

  it('skips plain narration without asking Claude', () => {
    for (const t of ['Okay, also hier mach ich jetzt immer raw materials.', 'Sehr wichtig.', 'I always check the PO first.', 'Post.']) {
      expect(mightBeToHelpy(t), t).toBe(false)
    }
  })
})

describe('recordCommand', () => {
  it('hears off / back on the record in English and German', () => {
    expect(recordCommand('Okay, this part is off the record.')).toBe('off')
    expect(recordCommand('Stop recording for a second')).toBe('off')
    expect(recordCommand('Das jetzt bitte inoffiziell.')).toBe('off')
    expect(recordCommand("We're back on the record.")).toBe('on')
    expect(recordCommand('Wieder aufnehmen bitte')).toBe('on')
  })

  it('ignores normal narration', () => {
    expect(recordCommand('I record the asset number from the PO.')).toBeNull()
    expect(recordCommand('Equipment over five thousand is always capex.')).toBeNull()
  })
})

describe('SpeechTracker', () => {
  it('marks the expert as speaking from the first real partial until the commit', () => {
    const s = new SpeechTracker()
    s.partial('   ', 1_000) // noise
    expect(s.isSpeaking()).toBe(false)
    expect(s.lastSpeechAt()).toBe(0)
    s.partial('Equipment over', 2_000)
    s.partial('Equipment over five thousand', 2_600)
    expect(s.isSpeaking()).toBe(true)
    expect(s.lastSpeechAt()).toBe(2_600)
    const u = s.committed('Equipment over five thousand is always capex.', 3_500)
    expect(u).toEqual({ text: 'Equipment over five thousand is always capex.', startedAt: 2_000, endedAt: 3_500 })
    expect(s.isSpeaking()).toBe(false)
    expect(s.lastSpeechAt()).toBe(3_500)
  })

  it('ignores empty commits', () => {
    expect(new SpeechTracker().committed('  ', 1_000)).toBeNull()
  })

  it('links the first turn about the work after a question as its answer, once', () => {
    const s = new SpeechTracker()
    s.questionAsked('q1', 'e7', 10_000)
    s.partial('Because', 14_000)
    const answer = s.claimAnswer(s.committed('Because it is over five thousand.', 15_000)!)
    expect(answer).toMatchObject({ answersQuestionId: 'q1', aboutEventId: 'e7' })
    s.partial('Next one', 20_000)
    expect(s.claimAnswer(s.committed('Next one.', 21_000)!).answersQuestionId).toBeUndefined()
  })

  it('keeps the question open while the expert talks to Helpy in between', () => {
    const s = new SpeechTracker()
    s.questionAsked('q1', undefined, 1_000)
    s.partial('Hörst du mich', 2_000)
    s.committed('Hörst du mich?', 2_500) // to Helpy: not claimed
    s.partial('Weil es über fünftausend ist', 4_000)
    expect(s.claimAnswer(s.committed('Weil es über fünftausend ist.', 5_000)!).answersQuestionId).toBe('q1')
  })

  it('does not treat a turn long after the question as the answer', () => {
    const s = new SpeechTracker()
    s.questionAsked('q1', undefined, 10_000)
    s.partial('Unrelated', 10_000 + ANSWER_WINDOW_MS + 1)
    expect(s.claimAnswer(s.committed('Unrelated.', 10_000 + ANSWER_WINDOW_MS + 500)!).answersQuestionId).toBeUndefined()
  })

  it('drops a half-heard turn (off the record, or while Helpy speaks)', () => {
    const s = new SpeechTracker()
    s.partial('Off the record', 1_000)
    s.dropTurn()
    expect(s.isSpeaking()).toBe(false)
    expect(s.currentPartial()).toBe('')
  })
})

describe('routeTurn: a clarification is not an answer', () => {
  const verdict = (intent: 'answer' | 'clarify' | 'skip' | 'other', toHelpy = false) => ({ intent, toHelpy })

  it('"Wie meinst du das?" after a question: Helpy explains, the same question stays open', () => {
    expect(routeTurn(verdict('clarify', true), true)).toBe('clarified')
  })

  it('only a real answer answers the question', () => {
    expect(routeTurn(verdict('answer'), true)).toBe('answer')
  })

  it('a skip closes the question without an answer', () => {
    expect(routeTurn(verdict('skip', true), true)).toBe('skipped')
  })

  it('narration about something else leaves the question open', () => {
    expect(routeTurn(verdict('other'), true)).toBe('narration')
    expect(routeTurn(verdict('other', true), true)).toBe('toHelpy')
  })

  it('without a verdict (Claude unavailable) a turn after a question counts as the answer, as before', () => {
    expect(routeTurn(null, true, 'Weil Kramer doppelt abrechnet.')).toBe('answer')
  })

  it('without a verdict an obvious question back is still not the answer', () => {
    for (const t of ['Wie meinst du das?', 'Was meinst du?', 'Welche Rechnung?', 'What do you mean?', 'Which one?', 'Can you repeat that?'])
      expect(routeTurn(null, true, t), t).toBe('clarified')
    expect(looksLikeQuestionBack('Wie meinst du das? Ich habe die Rechnung gehalten, weil Kramer am Quartalsende immer doppelt abrechnet und Weber sie freigibt.')).toBe(false)
  })

  it('without an open question nothing is a clarification', () => {
    expect(routeTurn(normalizeTurn({ intent: 'clarify', toHelpy: true, reply: 'x', language: 'keep' }), false)).toBe('toHelpy')
    expect(normalizeTurn({ intent: 'answer', toHelpy: true, reply: 'Thanks', language: 'keep' }, 'Why?')).toMatchObject({ toHelpy: false, reply: '' })
  })

  it('a clarification is never met with silence: at least the question is said again', () => {
    expect(normalizeTurn({ intent: 'clarify', toHelpy: true, reply: ' ', language: 'keep' }, 'Why capex?').reply).toBe('Why capex?')
  })
})

describe('SpeechTracker: the open question', () => {
  it('stays open after a clarification, with a fresh answer window, until the real answer', () => {
    const s = new SpeechTracker()
    s.questionAsked('q1', 'e7', 1_000, 'You moved that one to capex. What made you do that?')
    expect(s.openQuestion(2_000)?.text).toBe('You moved that one to capex. What made you do that?')
    s.reopenQuestion(1_000 + ANSWER_WINDOW_MS) // Helpy explained it late in the window
    expect(s.openQuestion(1_000 + ANSWER_WINDOW_MS + 10_000)).not.toBeNull()
    s.partial('Weil es über fünftausend ist', 1_000 + ANSWER_WINDOW_MS + 12_000)
    const u = s.committed('Weil es über fünftausend ist.', 1_000 + ANSWER_WINDOW_MS + 13_000)!
    expect(s.claimAnswer(u).answersQuestionId).toBe('q1')
  })

  it('is closed by a skip', () => {
    const s = new SpeechTracker()
    s.questionAsked('q1', undefined, 1_000, 'Why?')
    s.dropQuestion()
    expect(s.openQuestion(2_000)).toBeNull()
  })
})
