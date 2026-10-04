import { useState } from 'react'
import { HelpyMark } from '../../mascot'
import { CATEGORIES, STATUS, statusOf, useProcesses, type Category, type Process } from './processes'
import { ProcessView } from './ProcessView'
import { panel } from './store'
import { field, textBtn } from './ui'

const day = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const lastRecorded = (p: Process) => p.recordings[0]?.startedAt ?? 0

/** Search by process name, category, step or person ("what did Sabine record?"). */
function matches(p: Process, q: string) {
  if (!q) return true
  const has = (text: string) => text.toLowerCase().includes(q)
  return has(p.name) || has(p.category) || p.people.some(has) || !!p.workMap?.steps.some((s) => has(s.title))
}

function Row({ process, active }: { process: Process; active: boolean }) {
  const status = STATUS[statusOf(process)]
  const last = lastRecorded(process)
  const meta = [process.category, process.people[0], last ? day(last) : process.example ? 'Example' : null].filter(Boolean).join(' · ')
  return (
    <li>
      <button
        type="button"
        aria-current={active || undefined}
        onClick={() => panel.show({ name: 'library', processId: process.id })}
        className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-150 ${active ? 'bg-helpy-soft' : 'hover:bg-rule-soft'}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-medium leading-snug text-ink">{process.name}</span>
          <span className="mt-0.5 block text-[14px] text-muted">{meta}</span>
        </span>
        <span className={`shrink-0 pt-0.5 text-[14px] font-medium ${status.tone}`}>{status.label}</span>
      </button>
    </li>
  )
}

/**
 * "Recorded processes": a large window to really search what the team knows, filter by category,
 * and open a process next to the list (steps, who recorded it, learn it).
 */
export function LibraryWindow({ processId }: { processId?: string }) {
  const processes = useProcesses()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const q = query.trim().toLowerCase()

  const shown = (processes ?? [])
    .filter((p) => (category === 'all' || p.category === category) && matches(p, q))
    .sort((a, b) => Number(a.example) - Number(b.example) || lastRecorded(b) - lastRecorded(a))
  const selected = processId ? (processes?.find((p) => p.id === processId) ?? null) : null

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-helpy-ink/35 p-4 font-helpy" onMouseDown={(e) => e.target === e.currentTarget && panel.close()}>
      <section role="dialog" aria-modal="true" aria-label="Recorded processes" className="helpy-pop flex h-[min(760px,100%)] w-[min(1040px,100%)] flex-col overflow-hidden rounded-2xl bg-white shadow-float ring-1 ring-black/5">
        <header className="flex items-center gap-3 border-b border-helpy-line px-5 py-3">
          <HelpyMark size={22} />
          <h2 className="m-0 text-[20px] font-semibold tracking-tight text-ink">Recorded processes</h2>
          {processes ? <span className="text-[15px] text-muted tabular-nums">{processes.length}</span> : null}
          <button type="button" onClick={panel.close} className="ml-auto h-10 rounded-lg px-3 text-[15px] font-medium text-muted hover:bg-rule-soft hover:text-ink">
            Close
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-3 border-b border-helpy-line px-5 py-3">
          <input
            type="search"
            autoFocus
            aria-label="Search a process, a step or a name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a process, a step or a name…"
            className={`${field} h-12 min-w-[min(100%,260px)] flex-1`}
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

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className={`min-h-0 overflow-y-auto overscroll-contain p-2 ${selected ? 'hidden md:block' : ''}`}>
            <p className="m-0 px-3 pb-1 pt-2 text-[14px] text-muted" aria-live="polite">
              {processes === undefined ? 'Loading…' : shown.length === 1 ? '1 process' : `${shown.length} processes`}
            </p>
            {processes !== undefined && shown.length === 0 ? <p className="m-0 px-3 py-3 text-[16px] text-muted">Nothing found. Try another word or category.</p> : null}
            <ul className="m-0 list-none p-0">
              {shown.map((p) => (
                <Row key={p.id} process={p} active={p.id === selected?.id} />
              ))}
            </ul>
          </div>

          <div className={`min-h-0 overflow-y-auto overscroll-contain border-helpy-line px-6 py-5 md:border-l ${selected ? '' : 'hidden md:block'}`}>
            {selected ? (
              <>
                <button type="button" className={`${textBtn} -ml-2 mb-2 md:hidden`} onClick={() => panel.show({ name: 'library' })}>
                  ‹ All processes
                </button>
                <ProcessView processId={selected.id} />
              </>
            ) : (
              <p className="m-0 max-w-sm pt-2 text-[16px] leading-snug text-muted">Choose a process to see its steps, who recorded it, and to learn it.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
