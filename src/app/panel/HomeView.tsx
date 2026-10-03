import { useState } from 'react'
import { panel } from './store'
import { STATUS, statusOf, useProcesses } from './processes'
import { field, primaryBtn } from './ui'

/** First thing Helpy shows: record something, answer open questions, or find what the team knows. */
export function HomeView() {
  const processes = useProcesses()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = (processes ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.workMap?.steps.some((s) => s.title.toLowerCase().includes(q)))
  const waiting = (processes ?? []).find((p) => !p.example && statusOf(p) === 'questions')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="m-0 text-[22px] font-semibold tracking-tight text-ink">Hi, I’m Helpy</h2>
        <p className="m-0 mt-1 text-[16px] leading-snug text-muted">I learn how you work and pass it on to your team.</p>
      </div>

      {waiting ? (
        <div className="rounded-xl bg-ask-soft p-4">
          <p className="m-0 text-[16px] font-medium leading-snug text-ink">I have a few questions about “{waiting.name}”.</p>
          <button type="button" onClick={() => panel.show({ name: 'questions', processId: waiting.id })} className={`${primaryBtn} mt-3`}>
            Answer now
          </button>
        </div>
      ) : null}

      <button type="button" onClick={() => panel.show({ name: 'record' })} className={primaryBtn}>
        <span className="size-3 rounded-full bg-white" aria-hidden />
        Record what I do
      </button>

      <div>
        <label htmlFor="helpy-search" className="block text-[15px] font-medium text-ink">
          What your team knows
        </label>
        <input id="helpy-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, e.g. invoices…" className={`${field} mt-2 h-12`} />
        <ul className="m-0 mt-2 list-none p-0">
          {processes === undefined ? <li className="py-3 text-[15px] text-muted">Loading…</li> : null}
          {processes !== undefined && shown.length === 0 ? <li className="py-3 text-[15px] text-muted">Nothing found.</li> : null}
          {shown.map((p) => {
            const status = STATUS[statusOf(p)]
            return (
              <li key={p.id} className="border-t border-helpy-line first:border-t-0">
                <button
                  type="button"
                  onClick={() => panel.show({ name: 'process', processId: p.id })}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors duration-150 hover:bg-rule-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-medium leading-snug text-ink">{p.name}</span>
                    <span className={`block text-[14px] ${status.tone}`}>
                      {status.label}
                      {p.example ? <span className="text-faint"> · example</span> : null}
                    </span>
                  </span>
                  <span className="text-[18px] text-faint" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
