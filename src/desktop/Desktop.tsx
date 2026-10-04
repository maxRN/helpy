import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { helpyApp } from '../app/helpy-app/store'
import { HelpyMark } from '../mascot'

// A mock desktop for the demo: it makes clear that Sabine AI sits on top of any desktop app,
// and that the ERP is only the example app.

type WindowState = 'closed' | 'open' | 'minimized'

// The story's moment: Thursday-afternoon feeling, two days before the December close.
const STORY_START = new Date(2025, 11, 29, 16, 10)

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
  const ctl = 'flex h-full w-11 items-center justify-center text-slate-600 hover:bg-slate-200'
  return (
    <section
      aria-label={title}
      hidden={hidden}
      className={`absolute z-10 flex min-w-0 flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-black/10 ${
        maximized ? 'inset-x-0 top-0 bottom-12' : 'top-[3%] right-[3%] bottom-[calc(3rem+3%)] left-[3%] rounded-lg'
      }`}
    >
      <header className="flex h-9 shrink-0 items-center border-b border-slate-200 bg-slate-50 select-none" onDoubleClick={onToggleMaximize}>
        <span className="ml-3 flex items-center gap-2 text-[12px] text-slate-700">
          <LedgerIcon size={16} />
          {title}
        </span>
        <span className="ml-auto flex h-full">
          <button type="button" aria-label="Minimize" className={ctl} onClick={onMinimize}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M0 5h10" stroke="currentColor" /></svg>
          </button>
          <button type="button" aria-label={maximized ? 'Restore' : 'Maximize'} className={ctl} onClick={onToggleMaximize}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
          </button>
          <button type="button" aria-label="Close" className={`${ctl} hover:bg-red-600 hover:text-white`} onClick={onClose}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
          </button>
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  )
}

/** Mock desktop with ProcureFlow and Helpy. `app` is rendered inside ProcureFlow's window. */
export function Desktop({ app }: { app: ReactNode }) {
  const [win, setWin] = useState<WindowState>('closed')
  const [maximized, setMaximized] = useState(false)
  const now = useStoryClock()

  const open = () => setWin('open')
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })

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

      <button
        type="button"
        onClick={open}
        className="absolute top-5 left-5 flex w-24 flex-col items-center gap-1.5 rounded-md p-2 text-center text-white outline-none hover:bg-white/15 focus-visible:bg-white/20 focus-visible:ring-1 focus-visible:ring-white/60"
      >
        <LedgerIcon />
        <span className="text-[12px] leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">ProcureFlow</span>
      </button>
      <button
        type="button"
        title="Open Helpy"
        onClick={() => helpyApp.open()}
        className="absolute top-28 left-5 flex w-24 flex-col items-center gap-1.5 rounded-md p-2 text-center text-white outline-none hover:bg-white/15 focus:bg-white/20 focus-visible:ring-1 focus-visible:ring-white/60"
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

      {/* Taskbar */}
      <footer className="absolute inset-x-0 bottom-0 z-20 flex h-12 items-center border-t border-white/10 bg-[#0f2129]/85 px-2 text-white backdrop-blur-md">
        <div className="flex flex-1 items-center justify-center gap-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-md" aria-label="Start" role="img">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <rect x="1" y="1" width="7" height="7" rx="1.5" fill="#9fd3e6" />
              <rect x="10" y="1" width="7" height="7" rx="1.5" fill="#9fd3e6" />
              <rect x="1" y="10" width="7" height="7" rx="1.5" fill="#9fd3e6" />
              <rect x="10" y="10" width="7" height="7" rx="1.5" fill="#9fd3e6" />
            </svg>
          </span>
          {win !== 'closed' ? (
            <button
              type="button"
              aria-label="ProcureFlow"
              onClick={() => setWin(win === 'minimized' ? 'open' : 'minimized')}
              className="relative flex h-9 w-10 items-center justify-center rounded-md hover:bg-white/10"
            >
              <LedgerIcon size={22} />
              <span className={`absolute bottom-0.5 h-0.5 rounded-full bg-sky-300 ${win === 'open' ? 'w-4' : 'w-1.5'}`} />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-4 pr-2 text-[11px] text-slate-200">
          <Link to="/projects" className="text-slate-300 hover:text-white hover:underline">
            Sabine AI · Projects
          </Link>
          <span className="flex flex-col items-end leading-tight tabular-nums">
            <span>{time}</span>
            <span>{date}</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
