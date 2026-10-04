import { useEffect, useState, type RefObject } from 'react'
import { HelpyMark, MASCOT_SIZE, useHelpyExtras, visibleBounds } from '../../mascot'
import { HomeView } from './HomeView'
import { LibraryWindow } from './LibraryWindow'
import { LearningView, MomentView, ReportView } from './LearningViews'
import { ProcessView } from './ProcessView'
import { SignInView } from './SignInView'
import { panel, usePanel, type View } from './store'

const WIDTH = 368
const GAP = 12

/** Where "Back" goes from each view. */
function backOf(view: View): View | null {
  switch (view.name) {
    case 'home':
    case 'signin':
      return null
    case 'moment':
      return view.processId ? { name: 'process', processId: view.processId } : null
    case 'report':
      return { name: 'learning' }
    case 'process':
      return { name: 'library', processId: view.processId }
    default:
      return { name: 'home' }
  }
}

/** Opens next to the robot's resting spot: to its left when there is room, above it otherwise. */
function usePlacement(boundsRef?: RefObject<HTMLElement | null>) {
  const home = useHelpyExtras((s) => s.home)
  const open = usePanel((s) => s.open)
  const [style, setStyle] = useState<React.CSSProperties>({})
  useEffect(() => {
    if (!open) return
    const place = () => {
      const b = visibleBounds(boundsRef?.current ?? null)
      const robotLeft = b.left + b.width - home.right - MASCOT_SIZE.width
      const robotBottom = b.top + b.height - home.bottom
      const roomLeft = robotLeft - GAP - b.left
      if (roomLeft >= WIDTH) {
        setStyle({ right: window.innerWidth - (robotLeft - GAP), bottom: window.innerHeight - robotBottom, maxHeight: robotBottom - b.top - 16 })
      } else {
        const top = robotBottom - MASCOT_SIZE.height - GAP
        setStyle({ right: Math.max(16, window.innerWidth - (b.left + b.width - home.right)), bottom: window.innerHeight - top, maxHeight: top - b.top - 16 })
      }
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, home, boundsRef])
  return style
}

/** Helpy's own little window: opens when you click the robot. */
export function HelpyPanel({ boundsRef }: { boundsRef?: RefObject<HTMLElement | null> }) {
  const open = usePanel((s) => s.open)
  const view = usePanel((s) => s.view)
  const style = usePlacement(boundsRef)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && panel.close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  // "Recorded processes" is too much for the small window next to the robot: it gets a large one.
  if (view.name === 'library') return <LibraryWindow processId={view.processId} />
  const back = backOf(view)

  return (
    <section
      role="dialog"
      aria-label="Helpy"
      className="helpy-pop fixed z-[55] flex flex-col overflow-hidden rounded-2xl bg-white font-helpy shadow-float ring-1 ring-black/5"
      style={{ width: `min(${WIDTH}px, calc(100vw - 2rem))`, ...style }}
    >
      <header className="flex items-center gap-2 px-3 pb-1 pt-2">
        {back ? (
          <button type="button" onClick={() => panel.show(back)} className="flex h-10 items-center gap-1 rounded-lg px-2 text-[15px] font-medium text-muted hover:bg-rule-soft hover:text-ink">
            ‹ Back
          </button>
        ) : (
          <span className="flex items-center gap-2 px-2 text-[15px] font-semibold text-ink" translate="no">
            <HelpyMark size={22} />
            Helpy
          </span>
        )}
        <button type="button" onClick={panel.close} className="ml-auto h-10 rounded-lg px-3 text-[15px] font-medium text-muted hover:bg-rule-soft hover:text-ink">
          Close
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
        {view.name === 'signin' ? <SignInView /> : null}
        {view.name === 'home' ? <HomeView /> : null}
        {view.name === 'process' ? <ProcessView processId={view.processId} /> : null}
        {view.name === 'learning' ? <LearningView /> : null}
        {view.name === 'report' ? <ReportView /> : null}
        {view.name === 'moment' ? <MomentView stepId={view.stepId} processId={view.processId} /> : null}
      </div>
    </section>
  )
}
