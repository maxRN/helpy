import { useEffect, useState, type ReactNode } from 'react'
import { helpyApp, useHelpyApp } from '../app/helpy-app/store'
import { DESKTOP_APP_TARGET } from '../erp/targetIds'
import { useTarget } from '../erp/useTarget'
import { HelpyMark } from '../mascot'
import { TITLE_BAR, TITLE_TEXT, TrafficLights, windowPlacement } from './TrafficLights'

// A mock desktop for the demo: it makes clear that Helpy sits on top of any desktop app,
// and that the ERP is only the example app.

type WindowState = 'closed' | 'open' | 'minimized'

// The story's moment, as in the brief: Thursday, 4:10 pm, two working days before the September close (see BUSINESS_DATE in src/erp/seed.ts).
const STORY_START = new Date(2026, 9, 1, 16, 10)

function useStoryClock() {
  const [now, setNow] = useState(STORY_START)
  useEffect(() => {
    const realStart = Date.now()
    const timer = setInterval(() => setNow(new Date(STORY_START.getTime() + (Date.now() - realStart))), 15_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function LedgerIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="6" y="4" width="36" height="40" rx="5" fill="#1f5f8b" />
      <rect x="6" y="4" width="36" height="10" rx="5" fill="#2f7fb5" />
      <rect x="6" y="10" width="36" height="4" fill="#2f7fb5" />
      <rect x="12" y="19" width="16" height="3" rx="1.5" fill="#e6f1f8" />
      <rect x="12" y="25" width="24" height="3" rx="1.5" fill="#a9cde6" />
      <rect x="12" y="31" width="20" height="3" rx="1.5" fill="#a9cde6" />
      <rect x="12" y="37" width="12" height="3" rx="1.5" fill="#a9cde6" />
      <circle cx="35" cy="37" r="5" fill="#f2b33d" />
      <path d="M33 37.2l1.4 1.4 2.6-2.8" stroke="#1f2a33" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WindowFrame({
  title,
  maximized,
  hidden,
  onMinimize,
  onToggleMaximize,
  onClose,
  children,
}: {
  title: string
  maximized: boolean
  hidden: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      hidden={hidden}
      className={`absolute z-10 flex min-w-0 flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-black/15 ${windowPlacement(maximized)}`}
    >
      <header className={TITLE_BAR} onDoubleClick={onToggleMaximize}>
        <TrafficLights onClose={onClose} onMinimize={onMinimize} onZoom={onToggleMaximize} zoomed={maximized} />
        <span className={TITLE_TEXT}>
          <LedgerIcon size={16} />
          {title}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  )
}

/** An app in the dock: icon, name on hover, a dot while it runs. */
function DockItem({ label, running, onClick, children }: { label: string; running: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="relative flex size-10 items-center justify-center rounded-xl outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {children}
      {running ? <span className="absolute -bottom-1 size-1 rounded-full bg-white/85" aria-hidden /> : null}
    </button>
  )
}

/** Mock desktop with ProcureFlow and Helpy. `app` is rendered inside ProcureFlow's window. */
export function Desktop({ app }: { app: ReactNode }) {
  const [win, setWin] = useState<WindowState>('closed')
  const [maximized, setMaximized] = useState(false)
  const now = useStoryClock()
  const helpyOpen = useHelpyApp((s) => s.open)
  // Helpy points at it in Teach ("First we open ProcureFlow").
  const appIcon = useTarget(DESKTOP_APP_TARGET)

  const open = () => setWin('open')
  const clock = `${now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  const activeApp = helpyOpen ? 'Helpy' : win === 'open' ? 'ProcureFlow' : 'Finder'

  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{ background: 'radial-gradient(120% 90% at 20% 10%, #3c7a8c 0%, #23505f 45%, #152f3a 100%)' }}
    >
      {/* Soft hills, so it reads as a wallpaper and not a flat color */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-12 h-1/2 w-full" viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden>
        <path d="M0 260 C 200 180, 380 300, 600 230 S 1000 160, 1200 240 L1200 400 L0 400 Z" fill="#1d4452" opacity="0.7" />
        <path d="M0 320 C 260 260, 520 360, 760 300 S 1060 270, 1200 320 L1200 400 L0 400 Z" fill="#163742" opacity="0.9" />
      </svg>

      {/* Menu bar */}
      <header className="absolute inset-x-0 top-0 z-20 flex h-7 items-center gap-5 bg-black/25 px-4 text-[13px] text-white backdrop-blur-xl select-none">
        <span className="flex items-center gap-5" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="7" cy="7" r="2.2" fill="currentColor" />
          </svg>
          <span className="font-semibold">{activeApp}</span>
          {['File', 'Edit', 'View', 'Window', 'Help'].map((m) => (
            <span key={m} className="hidden text-white/90 sm:inline">
              {m}
            </span>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-4 tabular-nums">
          <span>{clock}</span>
        </span>
      </header>

      <button
        ref={appIcon}
        type="button"
        onClick={open}
        className="absolute top-12 left-5 flex w-24 flex-col items-center gap-1.5 rounded-lg p-2 text-center text-white outline-none hover:bg-white/15 focus-visible:bg-white/20 focus-visible:ring-1 focus-visible:ring-white/60"
      >
        <LedgerIcon />
        <span className="text-[12px] leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">ProcureFlow</span>
      </button>
      <button
        type="button"
        title="Open Helpy"
        onClick={() => helpyApp.open()}
        className="absolute top-36 left-5 flex w-24 flex-col items-center gap-1.5 rounded-lg p-2 text-center text-white outline-none hover:bg-white/15 focus:bg-white/20 focus-visible:ring-1 focus-visible:ring-white/60"
      >
        <span className="flex h-11 items-center"><HelpyMark size={44} /></span>
        <span className="text-[12px] leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">Helpy</span>
      </button>

      {win !== 'closed' ? (
        <WindowFrame
          title="ProcureFlow — Hartmann Machine Works"
          maximized={maximized}
          hidden={win === 'minimized'}
          onMinimize={() => setWin('minimized')}
          onToggleMaximize={() => setMaximized((m) => !m)}
          onClose={() => setWin('closed')}
        >
          {app}
        </WindowFrame>
      ) : null}

      {/* Dock, in the same strip the windows and Helpy keep clear of (h-12) */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-12 items-center justify-center">
        <nav aria-label="Dock" className="pointer-events-auto flex h-11 items-center gap-1.5 rounded-2xl border border-white/25 bg-white/20 px-2 shadow-lg backdrop-blur-xl">
          <DockItem label="ProcureFlow" running={win !== 'closed'} onClick={open}>
            <LedgerIcon size={32} />
          </DockItem>
          <DockItem label="Helpy" running onClick={() => helpyApp.open()}>
            <HelpyMark size={30} />
          </DockItem>
        </nav>
      </footer>
    </div>
  )
}
