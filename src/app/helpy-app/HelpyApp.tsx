import { TITLE_BAR, TITLE_TEXT, TrafficLights, windowPlacement } from '../../desktop/TrafficLights'
import { HelpyMark } from '../../mascot'
import { useAuth } from '../auth'
import { useProcess, useProcesses } from '../panel/processes'
import { Avatar } from '../panel/Avatar'
import { CompanyPage } from './CompanyPage'
import { ProcessesPage } from './ProcessesPage'
import { StepPage } from './StepPage'
import { helpyApp, parentPage, useHelpyApp, type AppPage } from './store'
import { WorkflowPage } from './WorkflowPage'

function BuildingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3.5" y="2.5" width="9" height="15" rx="1.5" />
      <path d="M12.5 7.5h3a1 1 0 0 1 1 1v9h-4M6.5 6h3M6.5 9h3M6.5 12h3M8 17.5v-2.5" strokeLinecap="round" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M7.5 5h9M7.5 10h9M7.5 15h9" />
      <circle cx="4" cy="5" r="0.9" fill="currentColor" />
      <circle cx="4" cy="10" r="0.9" fill="currentColor" />
      <circle cx="4" cy="15" r="0.9" fill="currentColor" />
    </svg>
  )
}

function NavItem({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] font-medium transition-colors duration-150 ${
        active ? 'bg-helpy-soft text-helpy' : 'text-ink hover:bg-rule-soft'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? <span className="text-[14px] text-muted tabular-nums">{count}</span> : null}
    </button>
  )
}

/** "Recorded processes › Pay a supplier invoice › Step 3", each part clickable. */
function Breadcrumb({ page }: { page: AppPage }) {
  const process = useProcess(page.name === 'workflow' || page.name === 'step' ? page.processId : null)
  if (page.name !== 'workflow' && page.name !== 'step') return null
  const step = page.name === 'step' ? process?.workMap?.steps.find((s) => s.id === page.stepId) : null
  const link = 'rounded-md px-1 text-helpy hover:underline'
  return (
    <nav aria-label="Where you are" className="flex min-w-0 flex-wrap items-center gap-x-1 text-[15px]">
      <button type="button" className={link} onClick={() => helpyApp.go({ name: 'processes' })}>
        Recorded processes
      </button>
      <span className="text-faint">›</span>
      {page.name === 'step' ? (
        <>
          <button type="button" className={`${link} max-w-[40ch] truncate`} onClick={() => helpyApp.go({ name: 'workflow', processId: page.processId })}>
            {process?.name ?? 'Process'}
          </button>
          <span className="text-faint">›</span>
          <span className="px-1 text-ink">Step {step?.index ?? ''}</span>
        </>
      ) : (
        <span className="max-w-[50ch] truncate px-1 text-ink">{process?.name ?? 'Process'}</span>
      )}
    </nav>
  )
}

/** Small arrow left of the breadcrumb: one level up (step -> its workflow, workflow -> the list). */
function BackButton({ page }: { page: AppPage }) {
  const up = parentPage(page)
  const process = useProcess(up?.name === 'workflow' ? up.processId : null)
  if (!up) return null
  const label = up.name === 'workflow' ? `Back to ${process?.name ?? 'the process'}` : 'Back to Recorded processes'
  return (
    <button
      type="button"
      onClick={helpyApp.back}
      aria-label={label}
      title={label}
      className="-ml-2 mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-rule-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-helpy-mint"
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M16 10H4M9 5l-5 5 5 5" />
      </svg>
    </button>
  )
}

/**
 * Helpy's app, opened from the robot ("Open Helpy") or desktop icon: a window as large as the ERP's. Logo top left,
 * pages on the left (Company info, Recorded processes), then a process as a workflow and a step as a guide.
 * The robot stays on top; "Teach me this" closes the window and the robot takes over.
 */
export function HelpyApp() {
  const { open, maximized, page } = useHelpyApp()
  const user = useAuth((s) => s.user)
  const count = useProcesses()?.length
  if (!open || !user) return null

  const onProcesses = page.name !== 'company'

  return (
    <section
      aria-label="Helpy"
      className={`fixed z-30 flex min-w-0 flex-col overflow-hidden bg-white font-helpy shadow-2xl ring-1 ring-black/15 ${windowPlacement(maximized)}`}
    >
      <header className={TITLE_BAR} onDoubleClick={helpyApp.toggleMaximize}>
        <TrafficLights onClose={helpyApp.close} onZoom={helpyApp.toggleMaximize} zoomed={maximized} />
        <span className={TITLE_TEXT}>
          <HelpyMark size={16} />
          Helpy — Hartmann Machine Works
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-helpy-line bg-helpy-paper p-3">
          <div className="flex items-center gap-2.5 px-2 pb-5 pt-2" translate="no">
            <HelpyMark size={34} />
            <span className="text-[22px] font-semibold tracking-tight text-ink">Helpy</span>
          </div>
          <nav aria-label="Pages" className="flex flex-col gap-1">
            <NavItem active={!onProcesses} onClick={() => helpyApp.go({ name: 'company' })} icon={<BuildingIcon />} label="Company info" />
            <NavItem active={onProcesses} onClick={() => helpyApp.go({ name: 'processes' })} icon={<ListIcon />} label="Recorded processes" count={count} />
          </nav>
          <div className="mt-auto flex items-center gap-2.5 border-t border-helpy-line px-2 pt-3">
            <Avatar name={user.name} size={32} />
            <span className="min-w-0 truncate text-[15px] text-muted">{user.name}</span>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {page.name === 'workflow' || page.name === 'step' ? (
            <div className="flex h-12 shrink-0 items-center border-b border-helpy-line px-7">
              <BackButton page={page} />
              <Breadcrumb page={page} />
            </div>
          ) : null}
          {/* Keyed by page, so every page starts at the top. */}
          <div key={JSON.stringify(page)} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 py-7">
            {page.name === 'company' ? <CompanyPage /> : null}
            {page.name === 'processes' ? <ProcessesPage /> : null}
            {page.name === 'workflow' ? <WorkflowPage processId={page.processId} /> : null}
            {page.name === 'step' ? <StepPage processId={page.processId} stepId={page.stepId} /> : null}
          </div>
        </main>
      </div>
    </section>
  )
}
