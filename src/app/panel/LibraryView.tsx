import { useState } from 'react'
import { panel } from './store'
import { STATUS, statusOf, useProcesses } from './processes'
import { field } from './ui'

/** What the team knows: every recorded process, searchable by task, step or person ("what did Sabine record?"). */
export function LibraryView() {
  const processes = useProcesses()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = (processes ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.people.some((n) => n.toLowerCase().includes(q)) || p.workMap?.steps.some((s) => s.title.toLowerCase().includes(q)),
  )

  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 text-[21px] font-semibold tracking-tight text-ink">Recorded processes</h2>
      <input
        type="search"
        autoFocus
        aria-label="Search a task or a name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a task or a name…"
        className={`${field} h-12`}
      />
      <ul className="m-0 list-none p-0">
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
                    {p.people[0] ? <span className="text-muted"> · {p.people[0]}</span> : null}
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
  )
}
