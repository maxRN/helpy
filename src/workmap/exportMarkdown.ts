// Work Map → Markdown instructions an agent can load (stretch goal "agent-ready guardrails").
// The same text is the tutor's knowledge (P2's getWorkMapMarkdown).
import type { WorkMap } from '../shared/types'
import { describeGuardrailLogic } from './conditions'

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function workMapToMarkdown(wm: WorkMap): string {
  const steps = [...wm.steps].sort((a, b) => a.index - b.index)
  const judgment = steps.filter((s) => s.isJudgmentCall)
  const out: string[] = []

  out.push(`# Agent instructions: ${wm.task}`)
  out.push('')
  out.push(
    `Learned from ${wm.expert} while she worked: ${steps.length} steps, ${judgment.length} judgment calls, ${wm.guardrails.length} guardrails. ` +
      (wm.teachback?.confirmed ? `${wm.expert} confirmed the teach-back.` : 'The teach-back is not confirmed yet.'),
  )
  out.push('')
  out.push('## How to work')
  out.push('')
  out.push('- Follow the steps in order.')
  out.push('- Before anything is posted, check every stop rule below.')
  out.push('- When a stop rule applies, do not act. Leave the item as it is and hand it to a human with the reason and the expert\'s words.')
  out.push('- Judgment calls are decided by a human whenever the case is not clearly covered by a rule.')
  out.push('')
  out.push('## Steps')
  out.push('')
  for (const s of steps) {
    out.push(`${s.index}. **${s.title}**${s.targetId ? ` (screen element \`${s.targetId}\`)` : ''}`)
    out.push(`   - What ${wm.expert} did: ${s.decision}`)
    if (s.reason) out.push(`   - Why, in ${wm.expert}'s words: "${s.reason.text}" (${mmss(s.reason.t)})`)
    if (s.isJudgmentCall) out.push('   - Judgment call: ask a human if the case differs from what is described here.')
    if (s.guardrailIds.length) out.push(`   - Stop rules: ${s.guardrailIds.join(', ')}`)
  }
  out.push('')
  out.push('## Stop rules (guardrails)')
  out.push('')
  for (const g of wm.guardrails) {
    const logic = describeGuardrailLogic(g)
    out.push(`- **${g.id}** (${g.severity === 'block' ? 'stop' : 'ask first'}): ${g.text}`)
    out.push(`  - Applies when ${logic.when}.`)
    out.push(`  - Required: ${logic.require}.`)
    out.push(`  - ${wm.expert}: "${g.quote.text}" (${mmss(g.quote.t)})`)
    out.push(
      g.severity === 'block'
        ? '  - If it is not met: stop, do not post, hand it to a human.'
        : '  - If it is not met: ask a human before you continue.',
    )
  }
  if (wm.openQuestions.length) {
    out.push('')
    out.push('## Not known yet (ask a human)')
    out.push('')
    for (const q of wm.openQuestions) out.push(`- ${q}`)
  }
  if (wm.teachback?.corrections.length) {
    out.push('')
    out.push(`## Corrections from ${wm.expert}`)
    out.push('')
    for (const c of wm.teachback.corrections) out.push(`- "${c.text}" (${mmss(c.t)})`)
  }
  out.push('')
  return out.join('\n')
}

/** Starts a download of the Markdown file in the browser. */
export function downloadWorkMapMarkdown(wm: WorkMap) {
  const blob = new Blob([workMapToMarkdown(wm)], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `work-map-${wm.sessionId}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
