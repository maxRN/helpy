// A question is only done when it is really answered: a question back is explained, never taken as the answer.
import { describe, expect, it, vi } from 'vitest'
import type { TurnIntent } from '../integration/speech'
import { askUntilAnswered, MAX_REPLIES, type ReplyLoopIO } from './replyLoop'

const QUESTION = 'You held the Kramer invoice. Why that one?'

/** The expert's replies in order, and Claude's verdict for each (by text). */
function io(replies: string[], verdicts: Record<string, TurnIntent>) {
  const queue = [...replies]
  const said: string[] = []
  const calls: string[] = []
  const o: ReplyLoopIO = {
    ask: vi.fn(async () => (calls.push('ask'), queue.shift() ?? null)),
    listen: vi.fn(async () => (calls.push('listen'), queue.shift() ?? null)),
    classify: vi.fn(async (reply: string) => {
      const intent = verdicts[reply] ?? 'answer'
      return { intent, toHelpy: intent !== 'answer', reply: intent === 'clarify' ? `I mean invoice 4472 from Kramer. ${QUESTION}` : '' }
    }),
    explain: vi.fn(async (text: string) => void said.push(text)),
  }
  return { o, said, calls }
}

describe('askUntilAnswered', () => {
  it('a clarification is not an answer: Helpy explains the same question and waits for the real answer', async () => {
    const { o, said, calls } = io(['Wie meinst du das?', 'Kramer schickt zum Quartalsende doppelte Rechnungen.'], { 'Wie meinst du das?': 'clarify' })
    const out = await askUntilAnswered(o)
    expect(out).toEqual({ kind: 'answered', answer: 'Kramer schickt zum Quartalsende doppelte Rechnungen.', clarifications: 1 })
    expect(said).toEqual([`I mean invoice 4472 from Kramer. ${QUESTION}`]) // the same question, explained
    expect(calls).toEqual(['ask', 'listen']) // asked once, then only listened
  })

  it('several questions back in a row are all explained before the answer', async () => {
    const { o, said } = io(['What do you mean?', 'Which invoice?', 'Because they double-bill.'], { 'What do you mean?': 'clarify', 'Which invoice?': 'clarify' })
    const out = await askUntilAnswered(o)
    expect(out).toMatchObject({ kind: 'answered', answer: 'Because they double-bill.', clarifications: 2 })
    expect(said).toHaveLength(2)
  })

  it('an explicit skip ends the question without an answer', async () => {
    const { o } = io(['Nächste Frage bitte.'], { 'Nächste Frage bitte.': 'skip' })
    expect(await askUntilAnswered(o)).toEqual({ kind: 'skipped', clarifications: 0 })
  })

  it('a side remark is not the answer either: Helpy keeps waiting', async () => {
    const { o } = io(['Moment, ich muss kurz was nachschauen.', 'Weil Kramer doppelt abrechnet.'], { 'Moment, ich muss kurz was nachschauen.': 'other' })
    expect(await askUntilAnswered(o)).toMatchObject({ kind: 'answered', answer: 'Weil Kramer doppelt abrechnet.' })
  })

  it('without a verdict the reply counts as the answer (Claude unavailable)', async () => {
    const { o } = io(['Because they double-bill.'], {})
    o.classify = vi.fn(async () => null)
    expect(await askUntilAnswered(o)).toMatchObject({ kind: 'answered' })
  })

  it('moves on after too many replies without an answer, or when nobody replies', async () => {
    const replies = Array.from({ length: MAX_REPLIES + 1 }, () => 'Wie meinst du das?')
    const { o } = io(replies, { 'Wie meinst du das?': 'clarify' })
    expect(await askUntilAnswered(o)).toEqual({ kind: 'unanswered', clarifications: MAX_REPLIES })
    expect(await askUntilAnswered(io([], {}).o)).toEqual({ kind: 'unanswered', clarifications: 0 })
  })
})
