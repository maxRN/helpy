import { describe, expect, it } from 'vitest'
import { ANSWER_WINDOW_MS, mightBeToHelpy, recordCommand, SpeechTracker } from './speech'

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
