import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useSession } from '../../shared/session'
import { downloadWorkMapMarkdown } from '../../workmap/exportMarkdown'
import { STATUS, statusOf, useProcess, type Process } from '../panel/processes'
import { Avatar } from '../panel/SignInView'
import { field, textBtn } from '../panel/ui'
import { answerQuestions, recordAgain, teach } from './actions'
import { helpyApp } from './store'
import { appPrimary, appSecondary, pageTitle, sectionTitle } from './ui'

const when = (t: number) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const howLong = (ms: number | null) => (ms === null ? '' : ms < 60_000 ? ' · under a minute' : ` · ${Math.round(ms / 60_000)} min`)

/** Who recorded it and when: one line per recording, newest first. */
function Recordings({ process }: { process: Process }) {
  return (
    <section>
      <h2 className={sectionTitle}>Recorded by</h2>
      {process.recordings.length ? (
        <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
          {process.recordings.map((r) => (
            <li key={r.taskId} className="flex items-center gap-3">
              <Avatar name={r.recordedBy ?? '?'} size={36} />
              <span className="min-w-0">
                <span className="block text-[16px] leading-snug text-ink">{r.recordedBy ?? 'Not signed in'}</span>
                <span className="block text-[14px] text-muted">{r.finished ? `${when(r.startedAt)}${howLong(r.durationMs)}` : 'Recording now'}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-2 text-[15px] text-muted">{process.example ? `Hand-written example, as ${process.people[0] ?? 'the expert'} explained it.` : 'Not recorded yet.'}</p>
      )}
      {!process.example ? (
        <button type="button" className={`${textBtn} -ml-2 mt-2`} onClick={() => recordAgain(process)}>
          {process.recordings.length ? 'Record it again' : 'Record it'}
        </button>
      ) : null}
    </section>
  )
}

/** The process name, with "Rename" (not for the hand-written example, which is not stored). */
function Title({ process }: { process: Process }) {
  const rename = useMutation(api.projects.rename)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(process.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!editing) {
    return (
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className={pageTitle}>{process.name}</h1>
        {!process.example ? (
          <button
            type="button"
            className={textBtn}
            onClick={() => {
              setName(process.name)
              setError('')
              setEditing(true)
            }}
          >
            Rename
          </button>
        ) : null}
      </div>
    )
  }

  const save = async () => {
    const next = name.trim()
    if (!next || next === process.name) return setEditing(false)
    setSaving(true)
    try {
      await rename({ projectId: process.id as Id<'projects'>, name: next })
      setEditing(false)
    } catch {
      setError('I couldn’t save the new name. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label htmlFor="helpy-process-name" className="text-[15px] font-medium text-ink">
        Name of the process
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="helpy-process-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          className={`${field} h-12 min-w-[min(100%,320px)] flex-1 text-[19px] font-semibold`}
        />
        <button type="submit" className={appPrimary} disabled={!name.trim() || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={appSecondary} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {error ? <p className="m-0 text-[15px] text-guard">{error}</p> : null}
    </form>
  )
}

/** One process as a workflow: every step in order; a click opens the step's guide. */
export function WorkflowPage({ processId }: { processId: string }) {
  const process = useProcess(processId)
  const currentSession = useSession((s) => s.sessionId)
  if (process === undefined) return <p className="m-0 text-[17px] text-muted">Loading…</p>
  if (process === null) return <p className="m-0 text-[17px] text-muted">I can’t find this process anymore.</p>

  const wm = process.workMap
  const status = statusOf(process)
  // The debrief works on the latest recording on this computer.
  const canAsk = !process.example && process.sessionId === currentSession && (status === 'questions' || status === 'processing')
  const steps = wm ? [...wm.steps].sort((a, b) => a.index - b.index) : []

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-6">
        <header>
          <p className="m-0 text-[15px] font-medium text-helpy">{process.category} · Workflow</p>
          <Title process={process} />
          <p className="m-0 mt-2 text-[16px] text-muted">
            {wm ? `Learned from ${wm.expert} · ${wm.steps.length} steps · ${wm.guardrails.length} rules · ` : ''}
            <span className={STATUS[status].tone}>{STATUS[status].label}</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {wm ? (
              <button type="button" className={appPrimary} onClick={() => teach(process)}>
                Teach me this
              </button>
            ) : null}
            {canAsk ? (
              <button type="button" className={wm ? appSecondary : appPrimary} onClick={answerQuestions}>
                Answer my questions
              </button>
            ) : null}
          </div>
        </header>

        {!wm ? (
          <p className="m-0 max-w-xl rounded-2xl bg-rule-soft p-5 text-[17px] leading-snug text-muted">
            {status === 'not_recorded'
              ? 'Nobody has recorded this yet.'
              : canAsk
                ? 'I have a few questions before I can write this down.'
                : 'This recording is not written down yet: the person who recorded it still has to answer Helpy’s questions.'}
          </p>
        ) : (
          <section>
            <h2 className={sectionTitle}>The steps</h2>
            <p className="m-0 mt-1 text-[15px] text-muted">Click a step for the exact guide.</p>
            <ol className="m-0 mt-4 list-none p-0">
              {steps.map((s, i) => {
                const rules = wm.guardrails.filter((g) => s.guardrailIds.includes(g.id))
                const stops = rules.filter((g) => g.severity === 'block').length
                const asks = rules.length - stops
                return (
                  <li key={s.id} className="relative pl-14">
                    {i < steps.length - 1 ? <span className="absolute top-11 bottom-0 left-[19px] w-0.5 bg-helpy-line" aria-hidden /> : null}
                    <span className="absolute top-2.5 left-0 flex size-10 items-center justify-center rounded-full bg-helpy-soft text-[16px] font-semibold text-helpy tabular-nums">{s.index}</span>
                    <button
                      type="button"
                      onClick={() => helpyApp.go({ name: 'step', processId: process.id, stepId: s.id })}
                      className="mb-3 flex w-full items-start gap-3 rounded-2xl border border-helpy-line bg-white px-4 py-3 text-left transition-colors duration-150 hover:border-faint"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-medium leading-snug text-ink">{s.title}</span>
                        <span className="mt-0.5 block text-[15px] text-muted">{s.decision}</span>
                        {s.isJudgmentCall || rules.length ? (
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {s.isJudgmentCall ? <span className="rounded-full bg-helpy-soft px-2.5 py-0.5 text-[13px] font-medium text-helpy">{wm.expert}’s judgment</span> : null}
                            {stops ? <span className="rounded-full bg-guard-soft px-2.5 py-0.5 text-[13px] font-medium text-guard">{stops === 1 ? '1 rule: stop' : `${stops} rules: stop`}</span> : null}
                            {asks ? <span className="rounded-full bg-ask-soft px-2.5 py-0.5 text-[13px] font-medium text-ask">{asks === 1 ? '1 rule: ask first' : `${asks} rules: ask first`}</span> : null}
                          </span>
                        ) : null}
                      </span>
                      <span className="pt-0.5 text-[20px] text-faint" aria-hidden>
                        ›
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-8">
        <Recordings process={process} />
        {wm ? (
          <section>
            <h2 className={sectionTitle}>For AI agents</h2>
            <p className="m-0 mt-1 text-[15px] text-muted">The same steps and rules as a file another AI agent can follow.</p>
            <button type="button" className={`${textBtn} -ml-2 mt-1`} onClick={() => downloadWorkMapMarkdown(wm)}>
              Export
            </button>
          </section>
        ) : null}
      </aside>
    </div>
  )
}
