import { describe, expect, it } from 'vitest'
import { ANSWER_WINDOW_MS, isDirectAddress, recordCommand, SpeechTracker } from './speech'

describe('isDirectAddress', () => {
  it('hears questions to Helpy in German and English', () => {
    for (const t of ['Hörst du mich?', 'Kannst du auch auf Deutsch antworten?', 'Aber warum antwortest du nicht?', 'Helpy, bist du da?', 'Can you hear me?', "Why aren't you answering?"]) {
      expect(isDirectAddress(t), t).toBe(true)
    }
  })

  it('ignores narration and team chatter', () => {
    for (const t of ['Wähl ich hier immer Equipment aus.', 'Ist das dein Whisper Flow?', 'Willst du nicht wissen, ob es funktioniert?', 'I always check the PO first.']) {
      expect(isDirectAddress(t), t).toBe(false)
    }
  })

  it('keeps a pending question open when the expert talks to Helpy in between', () => {
    const s = new SpeechTracker()
    s.questionAsked('q1', undefined, 1_000)
    s.partial('Hörst du mich', 2_000)
    expect(s.committed('Hörst du mich?', 2_500, false)?.answersQuestionId).toBeUndefined()
    s.partial('Weil es über fünftausend ist', 4_000)
    expect(s.committed('Weil es über fünftausend ist.', 5_000)?.answersQuestionId).toBe('q1')
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
    const s = new SpeechTracker()
    expect(s.committed('  ', 1_000)).toBeNull()
  })

  it('links the next turn after a question as its answer, once', () => {
    const s = new SpeechTracker()
    s.questionAsked('q1', 'e7', 10_000)
    s.partial('Because', 14_000)
    const answer = s.committed('Because it is over five thousand.', 15_000)
    expect(answer).toMatchObject({ answersQuestionId: 'q1', aboutEventId: 'e7' })
    s.partial('Next one', 20_000)
    expect(s.committed('Next one.', 21_000)?.answersQuestionId).toBeUndefined()
  })

  it('does not treat a turn long after the question as the answer', () => {
    const s = new SpeechTracker()
    s.questionAsked('q1', undefined, 10_000)
    s.partial('Unrelated', 10_000 + ANSWER_WINDOW_MS + 1)
    expect(s.committed('Unrelated.', 10_000 + ANSWER_WINDOW_MS + 500)?.answersQuestionId).toBeUndefined()
  })

  it('drops a half-heard turn (off the record, or while Helpy speaks)', () => {
    const s = new SpeechTracker()
    s.partial('Off the record', 1_000)
    s.dropTurn()
    expect(s.isSpeaking()).toBe(false)
    expect(s.currentPartial()).toBe('')
  })
})
