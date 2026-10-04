import { useState } from 'react'
import { CATEGORIES, STATUS, statusOf, useProcesses, type Category, type Process } from '../panel/processes'
import { field } from '../panel/ui'
import { helpyApp } from './store'
import { pageTitle } from './ui'

export const day = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const lastRecorded = (p: Process) => p.recordings[0]?.startedAt ?? 0

/** Search by process name, category, step or person ("what did Sabine record?"). */
function matches(p: Process, q: string) {
  if (!q) return true
  const has = (text: string) => text.toLowerCase().includes(q)
  return has(p.name) || has(p.category) || p.people.some(has) || !!p.workMap?.steps.some((s) => has(s.title))
}

/** Everything the team recorded: search, filter by category, open one as a workflow. */
export function ProcessesPage() {
  const processes = useProcesses()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const q = query.trim().toLowerCase()
  const shown = (processes ?? [])
    .filter((p) => (category === 'all' || p.category === category) && matches(p, q))
    .sort((a, b) => Number(a.example) - Number(b.example) || lastRecorded(b) - lastRecorded(a))

  return (
    <div className="flex flex-col gap-5">
      <h1 className={pageTitle}>Recorded processes</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          autoFocus
          aria-label="Search a process, a step or a name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a process, a step or a name…"
          className={`${field} h-12 min-w-[min(100%,280px)] flex-1`}
        />
        <div role="group" aria-label="Category" className="flex items-center gap-1.5">
          <span className="mr-1 text-[15px] text-muted">Category</span>
          {(['all', ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`h-10 rounded-full px-4 text-[15px] font-medium transition-colors duration-150 ${
                category === c ? 'bg-helpy text-white' : 'border border-helpy-line bg-white text-ink hover:border-faint'
              }`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="m-0 pb-2 text-[14px] text-muted" aria-live="polite">
          {processes === undefined ? 'Loading…' : shown.length === 1 ? '1 process' : `${shown.length} processes`}
        </p>
        {processes !== undefined && shown.length === 0 ? <p className="m-0 py-3 text-[16px] text-muted">Nothing found. Try another word or category.</p> : null}
        {shown.length ? (
          <table className="w-full border-collapse text-left">
            <thead className="text-[14px] text-muted">
              <tr>
                <th className="px-3 pb-2 font-medium">Process</th>
                <th className="hidden px-3 pb-2 font-medium md:table-cell">Category</th>
                <th className="hidden px-3 pb-2 font-medium md:table-cell">Recorded by</th>
                <th className="hidden px-3 pb-2 font-medium lg:table-cell">Last recorded</th>
                <th className="px-3 pb-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const status = STATUS[statusOf(p)]
                const last = lastRecorded(p)
                return (
                  <tr
                    key={p.id}
                    onClick={() => helpyApp.go({ name: 'workflow', processId: p.id })}
                    className="cursor-pointer border-t border-helpy-line transition-colors duration-150 hover:bg-rule-soft"
                  >
                    <td className="px-3 py-3.5">
                      {/* The name is a button so the row works with the keyboard too; its click reaches the row. */}
                      <button type="button" className="text-left text-[17px] font-medium leading-snug text-ink outline-none focus-visible:underline">
                        {p.name}
                      </button>
                      {p.workMap ? <span className="block text-[14px] text-muted">{p.workMap.steps.length} steps · {p.workMap.guardrails.length} rules</span> : null}
                    </td>
                    <td className="hidden px-3 py-3.5 text-[15px] text-ink md:table-cell">{p.category}</td>
                    <td className="hidden px-3 py-3.5 text-[15px] text-ink md:table-cell">{p.people[0] ?? <span className="text-faint">—</span>}</td>
                    <td className="hidden px-3 py-3.5 text-[15px] text-muted lg:table-cell">{last ? day(last) : p.example ? 'Example' : '—'}</td>
                    <td className={`px-3 py-3.5 text-right text-[15px] font-medium whitespace-nowrap ${status.tone}`}>{status.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  )
}
