// One question, asked until it is really answered: a question back ("Wie meinst du das?", "Which invoice?") is
// explained and the same question stays open; only a real answer or an explicit skip ends it.
// Plain logic without audio, so the rule "a clarification is not an answer" can be tested.
import type { TurnIntent } from '../integration/speech'

/** At most this many replies per question before Helpy moves on (clarifications and side remarks together). */
export const MAX_REPLIES = 4

export interface ReplyLoopIO {
  /** Says the question and resolves with the next reply (null: no reply, skipped or interrupted). */
  ask(): Promise<string | null>
  /** Waits for the next reply to the same question, without asking it again. */
  listen(): Promise<string | null>
  /** Claude's verdict on a reply to the question (null: could not decide, the reply counts as the answer). */
  classify(reply: string): Promise<{ intent: TurnIntent; toHelpy: boolean; reply: string } | null>
  /** Makes sure Helpy's explanation (or reply) is said before listening again. */
  explain(text: string): Promise<void>
  stopped?(): boolean
}

export type ReplyOutcome =
  | { kind: 'answered'; answer: string; clarifications: number }
  | { kind: 'skipped'; clarifications: number }
  | { kind: 'unanswered'; clarifications: number }

export async function askUntilAnswered(io: ReplyLoopIO): Promise<ReplyOutcome> {
  let clarifications = 0
  let reply = await io.ask()
  for (let n = 0; n < MAX_REPLIES; n++) {
    if (!reply || io.stopped?.()) return { kind: 'unanswered', clarifications }
    const verdict = await io.classify(reply)
    if (!verdict || verdict.intent === 'answer') return { kind: 'answered', answer: reply, clarifications }
    if (verdict.intent === 'skip') return { kind: 'skipped', clarifications }
    if (verdict.intent === 'clarify') clarifications++
    // A question back, or something else said to Helpy: Helpy answers it, then waits for the real answer.
    if (verdict.reply) await io.explain(verdict.reply)
    if (io.stopped?.()) return { kind: 'unanswered', clarifications }
    reply = await io.listen()
  }
  return { kind: 'unanswered', clarifications }
}
