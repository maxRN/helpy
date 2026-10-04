import { describe, expect, it } from 'vitest'
import { ANSWER_WINDOW_MS, SpeechTracker } from './speech'

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
